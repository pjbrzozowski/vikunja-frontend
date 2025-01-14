import {defineStore, acceptHMRUpdate} from 'pinia'
import router from '@/router'
import {formatISO} from 'date-fns'

import TaskService from '@/services/task'
import TaskAssigneeService from '@/services/taskAssignee'
import LabelTaskService from '@/services/labelTask'
import UserService from '@/services/user'

import {playPop} from '@/helpers/playPop'
import {getQuickAddMagicMode} from '@/helpers/quickAddMagicMode'
import {parseTaskText} from '@/modules/parseTaskText'

import TaskAssigneeModel from '@/models/taskAssignee'
import LabelTaskModel from '@/models/labelTask'
import TaskModel from '@/models/task'
import LabelTask from '@/models/labelTask'
import LabelModel from '@/models/label'

import type {ILabel} from '@/modelTypes/ILabel'
import type {ITask} from '@/modelTypes/ITask'
import type {IUser} from '@/modelTypes/IUser'
import type {IAttachment} from '@/modelTypes/IAttachment'
import type {IList} from '@/modelTypes/IList'

import {setModuleLoading} from '@/stores/helper'
import {useLabelStore} from '@/stores/labels'
import {useListStore} from '@/stores/lists'
import {useAttachmentStore} from '@/stores/attachments'
import {useKanbanStore} from '@/stores/kanban'
import {useBaseStore} from '@/stores/base'

// IDEA: maybe use a small fuzzy search here to prevent errors
function findPropertyByValue(object, key, value) {
	return Object.values(object).find(
		(l) => l[key]?.toLowerCase() === value.toLowerCase(),
	)
}

// Check if the user exists in the search results
function validateUser(
	users: IUser[],
	query: IUser['username'] | IUser['name'] | IUser['email'],
) {
	return findPropertyByValue(users, 'username', query) ||
		findPropertyByValue(users, 'name', query) ||
		findPropertyByValue(users, 'email', query)
}

// Check if the label exists
function validateLabel(labels: ILabel[], label: string) {
	return findPropertyByValue(labels, 'title', label)
}

async function addLabelToTask(task: ITask, label: ILabel) {
	const labelTask = new LabelTask({
		taskId: task.id,
		labelId: label.id,
	})
	const labelTaskService = new LabelTaskService()
	const response = await labelTaskService.create(labelTask)
	task.labels.push(label)
	return response
}

async function findAssignees(parsedTaskAssignees: string[]) {
	if (parsedTaskAssignees.length <= 0) {
		return []
	}

	const userService = new UserService()
	const assignees = parsedTaskAssignees.map(async a => {
		const users = await userService.getAll({}, {s: a})
		return validateUser(users, a)
	})

	const validatedUsers = await Promise.all(assignees) 
	return validatedUsers.filter((item) => Boolean(item))
}

export interface TaskState {
	tasks: { [id: ITask['id']]: ITask }
	isLoading: boolean,
}

export const useTaskStore = defineStore('task', {
	state: () : TaskState => ({
		tasks: {},
		isLoading: false,
	}),
	getters: {
		hasTasks(state) {
			return Object.keys(state.tasks).length > 0
		},
	},
	actions: {
		setTasks(tasks: ITask[]) {
			tasks.forEach(task => {
				this.tasks[task.id] = task
			})
		},

		async loadTasks(params) {
			const taskService = new TaskService()

			const cancel = setModuleLoading(this)
			try {
				this.tasks = await taskService.getAll({}, params)
				useBaseStore().setHasTasks(this.tasks.length > 0)
				return this.tasks
			} finally {
				cancel()
			}
		},

		async update(task: ITask) {
			const cancel = setModuleLoading(this)

			const taskService = new TaskService()
			try {
				const updatedTask = await taskService.update(task)
				useKanbanStore().setTaskInBucket(updatedTask)
				if (task.done) {
					playPop()
				}
				return updatedTask
			} finally {
				cancel()
			}
		},

		async delete(task: ITask) {
			const taskService = new TaskService()
			const response = await taskService.delete(task)
			useKanbanStore().removeTaskInBucket(task)
			return response
		},

		// Adds a task attachment in store.
		// This is an action to be able to commit other mutations
		addTaskAttachment({
			taskId,
			attachment,
		}: {
			taskId: ITask['id']
			attachment: IAttachment
		}) {
			const kanbanStore = useKanbanStore()
			const t = kanbanStore.getTaskById(taskId)
			if (t.task !== null) {
				const attachments = [
					...t.task.attachments,
					attachment,
				]

				const newTask = {
					...t,
					task: {
						...t.task,
						attachments,
					},
				}
				kanbanStore.setTaskInBucketByIndex(newTask)
			}
			const attachmentStore = useAttachmentStore()
			attachmentStore.add(attachment)
		},

		async addAssignee({
			user,
			taskId,
		}: {
			user: IUser,
			taskId: ITask['id']
		}) {
			const cancel = setModuleLoading(this)
			
			try {
				const kanbanStore = useKanbanStore()
				const taskAssigneeService = new TaskAssigneeService()
				const r = await taskAssigneeService.create(new TaskAssigneeModel({
					userId: user.id,
					taskId: taskId,
				}))
				const t = kanbanStore.getTaskById(taskId)
				if (t.task === null) {
					// Don't try further adding a label if the task is not in kanban
					// Usually this means the kanban board hasn't been accessed until now.
					// Vuex seems to have its difficulties with that, so we just log the error and fail silently.
					console.debug('Could not add assignee to task in kanban, task not found', t)
					return r
				}

				kanbanStore.setTaskInBucketByIndex({
					...t,
					task: {
						...t.task,
						assignees: [
							...t.task.assignees,
							user,
						],
					},
				})

				return r
			} finally {
				cancel()
			}
		},

		async removeAssignee({
			user,
			taskId,
		}: {
			user: IUser,
			taskId: ITask['id']
		}) {
			const kanbanStore = useKanbanStore()
			const taskAssigneeService = new TaskAssigneeService()
			const response = await taskAssigneeService.delete(new TaskAssigneeModel({
				userId: user.id,
				taskId: taskId,
			}))
			const t = kanbanStore.getTaskById(taskId)
			if (t.task === null) {
				// Don't try further adding a label if the task is not in kanban
				// Usually this means the kanban board hasn't been accessed until now.
				// Vuex seems to have its difficulties with that, so we just log the error and fail silently.
				console.debug('Could not remove assignee from task in kanban, task not found', t)
				return response
			}

			const assignees = t.task.assignees.filter(({ id }) => id !== user.id)

			kanbanStore.setTaskInBucketByIndex({
				...t,
				task: {
					...t.task,
					assignees,
				},
			})
			return response

		},

		async addLabel({
			label,
			taskId,
		} : {
			label: ILabel,
			taskId: ITask['id']
		}) {
			const kanbanStore = useKanbanStore()
			const labelTaskService = new LabelTaskService()
			const r = await labelTaskService.create(new LabelTaskModel({
				taskId,
				labelId: label.id,
			}))
			const t = kanbanStore.getTaskById(taskId)
			if (t.task === null) {
				// Don't try further adding a label if the task is not in kanban
				// Usually this means the kanban board hasn't been accessed until now.
				// Vuex seems to have its difficulties with that, so we just log the error and fail silently.
				console.debug('Could not add label to task in kanban, task not found', {taskId, t})
				return r
			}

			kanbanStore.setTaskInBucketByIndex({
				...t,
				task: {
					...t.task,
					labels: [
						...t.task.labels,
						label,
					],
				},
			})

			return r
		},

		async removeLabel(
			{label, taskId}:
			{label: ILabel, taskId: ITask['id']},
		) {
			const kanbanStore = useKanbanStore()
			const labelTaskService = new LabelTaskService()
			const response = await labelTaskService.delete(new LabelTaskModel({
				taskId, labelId:
				label.id,
			}))
			const t = kanbanStore.getTaskById(taskId)
			if (t.task === null) {
				// Don't try further adding a label if the task is not in kanban
				// Usually this means the kanban board hasn't been accessed until now.
				// Vuex seems to have its difficulties with that, so we just log the error and fail silently.
				console.debug('Could not remove label from task in kanban, task not found', t)
				return response
			}

			// Remove the label from the list
			const labels = t.task.labels.filter(({ id }) => id !== label.id)

			kanbanStore.setTaskInBucketByIndex({
				...t,
				task: {
					...t.task,
					labels,
				},
			})

			return response
		},

		// Do everything that is involved in finding, creating and adding the label to the task
		async addLabelsToTask(
			{ task, parsedLabels }:
			{ task: ITask, parsedLabels: string[] },
		) {
			if (parsedLabels.length <= 0) {
				return task
			}

			const labelStore = useLabelStore()

			const labelAddsToWaitFor = parsedLabels.map(async labelTitle => {
				let label = validateLabel(Object.values(labelStore.labels), labelTitle)
				if (typeof label === 'undefined') {
					// label not found, create it
					const labelModel = new LabelModel({title: labelTitle})
					label = await labelStore.createLabel(labelModel)
				}

				return addLabelToTask(task, label)
			})

			// This waits until all labels are created and added to the task
			await Promise.all(labelAddsToWaitFor)
			return task
		},

		findListId(
			{ list: listName, listId }:
			{ list: string, listId: IList['id'] }) {
			let foundListId = null
			
			// Uses the following ways to get the list id of the new task:
			//  1. If specified in quick add magic, look in store if it exists and use it if it does
			if (listName !== null) {
				const listStore = useListStore()
				const list = listStore.findListByExactname(listName)
				foundListId = list === null ? null : list.id
			}
			
			//  2. Else check if a list was passed as parameter
			if (foundListId === null && listId !== 0) {
				foundListId = listId
			}
		
			//  3. Otherwise use the id from the route parameter
			if (typeof router.currentRoute.value.params.listId !== 'undefined') {
				foundListId = Number(router.currentRoute.value.params.listId)
			}
			
			//  4. If none of the above worked, reject the promise with an error.
			if (typeof foundListId === 'undefined' || listId === null) {
				throw new Error('NO_LIST')
			}
		
			return foundListId
		},

		async createNewTask({
			title,
			bucketId,
			listId,
			position,
		} : 
			Partial<ITask>,
		) {
			const cancel = setModuleLoading(this)
			const parsedTask = parseTaskText(title, getQuickAddMagicMode())
		
			const foundListId = await this.findListId({
				list: parsedTask.list,
				listId: listId || 0,
			})
			
			if(foundListId === null || foundListId === 0) {
				cancel()
				throw new Error('NO_LIST')
			}
		
			const assignees = await findAssignees(parsedTask.assignees)
			
			// I don't know why, but it all goes up in flames when I just pass in the date normally.
			const dueDate = parsedTask.date !== null ? formatISO(parsedTask.date) : null
		
			const task = new TaskModel({
				title: parsedTask.text,
				listId: foundListId,
				dueDate,
				priority: parsedTask.priority,
				assignees,
				bucketId: bucketId || 0,
				position,
			})
			task.repeatAfter = parsedTask.repeats
		
			const taskService = new TaskService()
			try {
				const createdTask = await taskService.create(task)
				const result = await this.addLabelsToTask({
					task: createdTask,
					parsedLabels: parsedTask.labels,
				})
				return result
			} finally {
				cancel()
			}
		},
		
		async setCoverImage(task: ITask, attachment: IAttachment | null) {
			return this.update({
				...task,
				coverImageAttachmentId: attachment ? attachment.id : 0,
			})
		},
	},
})

// support hot reloading
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useTaskStore, import.meta.hot))
}