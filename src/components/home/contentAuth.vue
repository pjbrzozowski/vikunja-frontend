<template>
	<div class="content-auth">
		<BaseButton
			v-if="menuActive"
			@click="baseStore.setMenuActive(false)"
			class="menu-hide-button d-print-none"
		>
			<icon icon="times"/>
		</BaseButton>
		<div
			:class="{'has-background': background || blurHash}"
			:style="{'background-image': blurHash && `url(${blurHash})`}"
			class="app-container"
		>
			<div
				:class="{'is-visible': background}"
				class="app-container-background background-fade-in d-print-none"
				:style="{'background-image': background && `url(${background})`}"></div>
			<navigation class="d-print-none"/>
			<main
				:class="[
					{ 'is-menu-enabled': menuActive },
					$route.name,
				]"
				class="app-content"
			>
				<BaseButton
					v-if="menuActive"
					@click="baseStore.setMenuActive(false)"
					class="mobile-overlay d-print-none"
				/>

				<quick-actions/>

				<router-view :route="routeWithModal" v-slot="{ Component }">
					<keep-alive :include="['list.list', 'list.gantt', 'list.table', 'list.kanban']">
						<component :is="Component"/>
					</keep-alive>
				</router-view>

				<modal
					v-if="currentModal"
					@close="closeModal()"
					variant="scrolling"
					class="task-detail-view-modal"
				>
					<component :is="currentModal"/>
				</modal>

				<BaseButton
					class="keyboard-shortcuts-button d-print-none"
					@click="showKeyboardShortcuts()"
					v-shortcut="'?'"
				>
					<icon icon="keyboard"/>
				</BaseButton>
			</main>
		</div>
	</div>
</template>

<script lang="ts" setup>
import {watch, computed} from 'vue'
import {useRoute} from 'vue-router'

import Navigation from '@/components/home/navigation.vue'
import QuickActions from '@/components/quick-actions/quick-actions.vue'
import BaseButton from '@/components/base/BaseButton.vue'

import {useBaseStore} from '@/stores/base'
import {useLabelStore} from '@/stores/labels'

import {useRouteWithModal} from '@/composables/useRouteWithModal'
import {useRenewTokenOnFocus} from '@/composables/useRenewTokenOnFocus'

const {routeWithModal, currentModal, closeModal} = useRouteWithModal()

const baseStore = useBaseStore()
const background = computed(() => baseStore.background)
const blurHash = computed(() => baseStore.blurHash)
const menuActive = computed(() => baseStore.menuActive)

function showKeyboardShortcuts() {
	baseStore.setKeyboardShortcutsActive(true)
}

const route = useRoute()

// hide menu on mobile
watch(() => route.fullPath, () => window.innerWidth < 769 && baseStore.setMenuActive(false))

// FIXME: this is really error prone
// Reset the current list highlight in menu if the current route is not list related.
watch(() => route.name as string, (routeName) => {
	if (
		routeName &&
		(
			[
				'home',
				'namespace.edit',
				'teams.index',
				'teams.edit',
				'tasks.range',
				'labels.index',
				'migrate.start',
				'migrate.wunderlist',
				'namespaces.index',
			].includes(routeName) ||
			routeName.startsWith('user.settings')
		)
	) {
		baseStore.handleSetCurrentList({list: null})
	}
})

// TODO: Reset the title if the page component does not set one itself

useRenewTokenOnFocus()

const labelStore = useLabelStore()
labelStore.loadAllLabels()
</script>

<style lang="scss" scoped>
.menu-hide-button {
	position: fixed;
	top: 0.5rem;
	right: 0.5rem;
	z-index: 31;
	width: 3rem;
	height: 3rem;
	display: flex;
	justify-content: center;
	align-items: center;
	font-size: 2rem;
	color: var(--grey-400);
	line-height: 1;
	transition: all $transition;

	@media screen and (min-width: $tablet) {
		display: none;
	}

	&:hover,
	&:focus {
		height: 1rem;
		color: var(--grey-600);
	}
}

.app-container {
	min-height: calc(100vh - 65px);

	@media screen and (max-width: $tablet) {
		padding-top: $navbar-height;
	}

	.app-content {
		z-index: 10;
		position: relative;
		padding-top: 1rem;

		@media screen {
			padding: $navbar-height + 1.5rem 1.5rem 1rem 1.5rem;
		}

		// Used to make sure the spinner is always in the middle while loading
		> .loader-container {
			min-height: calc(100vh - #{$navbar-height + 1.5rem + 1rem});
		}

		@media screen and (max-width: $tablet) {
			margin-left: 0;
			padding-top: 1.5rem;
			min-height: calc(100vh - 4rem);
		}

		@media screen {
			&.is-menu-enabled {
				margin-left: $navbar-width;

				@media screen and (max-width: $tablet) {
					min-width: 100%;
					margin-left: 0;
				}
			}
		}

		.card {
			background: var(--white);
		}
	}
}

.mobile-overlay {
	display: none;
	position: fixed;
	top: 0;
	bottom: 0;
	left: 0;
	right: 0;
	height: 100vh;
	width: 100vw;
	background: hsla(var(--grey-100-hsl), 0.8);
	z-index: 5;
	opacity: 0;
	transition: all $transition;

	@media screen and (max-width: $tablet) {
		display: block;
		opacity: 1;
	}
}

.keyboard-shortcuts-button {
	position: fixed;
	bottom: calc(1rem - 4px);
	right: 1rem;
	z-index: 4500; // The modal has a z-index of 4000

	color: var(--grey-500);
	transition: color $transition;

	@media screen and (max-width: $tablet) {
		display: none;
	}
}

.content-auth {
	position: relative;
	z-index: 1;
}

.is-touch .content-auth,
.content-auth.z-unset {
	z-index: unset;
}

@include modal-transition();
</style>