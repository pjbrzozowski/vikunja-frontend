<template>
	<div class="task-add">
		<div class="field is-grouped">
			<p class="control has-icons-left is-expanded">
				<textarea
					:disabled="loading || undefined"
					class="add-task-textarea input"
					:class="{'textarea-empty': newTaskTitle === ''}"
					:placeholder="$t('list.list.addPlaceholder')"
					rows="1"
					v-focus
					v-model="newTaskTitle"
					ref="newTaskInput"
					@keyup="resetEmptyTitleError"
					@keydown.enter="handleEnter"
				/>
				<span class="icon is-small is-left">
					<icon icon="tasks"/>
				</span>
			</p>
			<p class="control">
				<x-button
					class="add-task-button"
					:disabled="newTaskTitle === '' || loading || undefined"
					@click="addTask()"
					icon="plus"
					:loading="loading"
					:aria-label="$t('list.list.add')"
				>
					<span class="button-text">
						{{ $t('list.list.add') }}
					</span>
				</x-button>
			</p>
		</div>
		<p class="help is-danger" v-if="errorMessage !== ''">
			{{ errorMessage }}
		</p>
		<quick-add-magic v-else/>
	</div>
</template>

<script setup lang="ts">
import {computed, ref, unref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {debouncedWatch, type MaybeRef, tryOnMounted, useWindowSize} from '@vueuse/core'

import QuickAddMagic from '@/components/tasks/partials/quick-add-magic.vue'
import type {ITask} from '@/modelTypes/ITask'
import {parseSubtasksViaIndention} from '@/helpers/parseSubtasksViaIndention'
import TaskRelationService from '@/services/taskRelation'
import TaskRelationModel from '@/models/taskRelation'
import {RELATION_KIND} from '@/types/IRelationKind'
import {useAuthStore} from '@/stores/auth'
import {useTaskStore} from '@/stores/tasks'

function useAutoHeightTextarea(value: MaybeRef<string>) {
	const textarea = ref<HTMLInputElement>()
	const minHeight = ref(0)

	// adapted from https://github.com/LeaVerou/stretchy/blob/47f5f065c733029acccb755cae793009645809e2/src/stretchy.js#L34
	function resize(textareaEl: HTMLInputElement | undefined) {
		if (!textareaEl) return

		let empty

		// the value here is the attribute value
		if (!textareaEl.value && textareaEl.placeholder) {
			empty = true
			textareaEl.value = textareaEl.placeholder
		}

		const cs = getComputedStyle(textareaEl)

		textareaEl.style.minHeight = ''
		textareaEl.style.height = '0'
		const offset = textareaEl.offsetHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
		const height = textareaEl.scrollHeight + offset + 'px'

		textareaEl.style.height = height

		// calculate min-height for the first time
		if (!minHeight.value) {
			minHeight.value = parseFloat(height)
		}

		textareaEl.style.minHeight = minHeight.value.toString()


		if (empty) {
			textareaEl.value = ''
		}

	}

	tryOnMounted(() => {
		if (textarea.value) {
			// we don't want scrollbars
			textarea.value.style.overflowY = 'hidden'
		}
	})

	const {width: windowWidth} = useWindowSize()

	debouncedWatch(
		windowWidth,
		() => resize(textarea.value),
		{debounce: 200},
	)

	// It is not possible to get notified of a change of the value attribute of a textarea without workarounds (setTimeout) 
	// So instead we watch the value that we bound to it.
	watch(
		() => [textarea.value, unref(value)],
		() => resize(textarea.value),
		{
			immediate: true, // calculate initial size
			flush: 'post', // resize after value change is rendered to DOM
		},
	)

	return textarea
}

const props = defineProps({
	defaultPosition: {
		type: Number,
		required: false,
	},
})

const emit = defineEmits(['taskAdded'])

const newTaskTitle = ref('')
const newTaskInput = useAutoHeightTextarea(newTaskTitle)

const {t} = useI18n({useScope: 'global'})
const authStore = useAuthStore()
const taskStore = useTaskStore()

const errorMessage = ref('')

function resetEmptyTitleError(e) {
	if (
		(e.which <= 90 && e.which >= 48 || e.which >= 96 && e.which <= 105)
		&& newTaskTitle.value !== ''
	) {
		errorMessage.value = ''
	}
}

const loading = computed(() => taskStore.isLoading)
async function addTask() {
	if (newTaskTitle.value === '') {
		errorMessage.value = t('list.create.addTitleRequired')
		return
	}
	errorMessage.value = ''

	if (loading.value) {
		return
	}

	const taskTitleBackup = newTaskTitle.value
	// This allows us to find the tasks with the title they had before being parsed
	// by quick add magic.
	const createdTasks: { [key: ITask['title']]: ITask } = {}
	const tasksToCreate = parseSubtasksViaIndention(newTaskTitle.value)
	const newTasks = tasksToCreate.map(async ({title}) => {
		if (title === '') {
			return
		}

		const task = await taskStore.createNewTask({
			title,
			listId: authStore.settings.defaultListId,
			position: props.defaultPosition,
		})
		createdTasks[title] = task
		return task
	})

	try {
		newTaskTitle.value = ''
		await Promise.all(newTasks)

		const taskRelationService = new TaskRelationService()
		const relations = tasksToCreate.map(async t => {
			const createdTask = createdTasks[t.title]
			if (typeof createdTask === 'undefined') {
				return
			}

			if (t.parent === null) {
				emit('taskAdded', createdTask)
				return
			}

			const createdParentTask = createdTasks[t.parent]
			if (typeof createdTask === 'undefined' || typeof createdParentTask === 'undefined') {
				return
			}

			const rel = await taskRelationService.create(new TaskRelationModel({
				taskId: createdTask.id,
				otherTaskId: createdParentTask.id,
				relationKind: RELATION_KIND.PARENTTASK,
			}))

			createdTask.relatedTasks[RELATION_KIND.PARENTTASK] = [createdParentTask]
			// we're only emitting here so that the relation shows up in the task list
			emit('taskAdded', createdTask)

			return rel
		})
		await Promise.all(relations)
	} catch (e: { message?: string }) {
		newTaskTitle.value = taskTitleBackup
		if (e?.message === 'NO_LIST') {
			errorMessage.value = t('list.create.addListRequired')
			return
		}
		throw e
	}
}

function handleEnter(e: KeyboardEvent) {
	// when pressing shift + enter we want to continue as we normally would. Otherwise, we want to create 
	// the new task(s). The vue event modifier don't allow this, hence this method.
	if (e.shiftKey) {
		return
	}

	e.preventDefault()
	addTask()
}

function focusTaskInput() {
	newTaskInput.value?.focus()
}

defineExpose({
	focusTaskInput,
})
</script>

<style lang="scss" scoped>
.task-add {
	margin-bottom: 0;
}

.add-task-button {
	height: 100% !important;

	@media screen and (max-width: $mobile) {
		.button-text {
			display: none;
		}

		:deep(.icon) {
			margin: 0 !important;
		}
	}
}

.add-task-textarea {
	transition: border-color $transition;
	resize: none;
}

// Adding this class when the textarea has no text prevents the textarea from wrapping the placeholder.
.textarea-empty {
	white-space: nowrap;
	text-overflow: ellipsis;
}
</style>
