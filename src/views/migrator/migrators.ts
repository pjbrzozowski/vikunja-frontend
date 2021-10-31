import wunderlistIcon from './icons/wunderlist.jpg'
import todoistIcon from './icons/todoist.svg'
import trelloIcon from './icons/trello.svg'
import microsoftTodoIcon from './icons/microsoft-todo.svg'
import vikunjaFileIcon from './icons/vikunja-file.png'

export interface Migrator {
	id: string
	name: string
	isFileMigrator?: boolean
	icon: string
}

interface IMigratorRecord {
	[key: Migrator['id']]: Migrator
 }

export const MIGRATORS: IMigratorRecord = {
	wunderlist: {
		id: 'wunderlist',
		name: 'Wunderlist',
		icon: wunderlistIcon,
	},
	todoist: {
		id: 'todoist',
		name: 'Todoist',
		icon: todoistIcon,
	},
	trello: {
		id: 'trello',
		name: 'Trello',
		icon: trelloIcon,
	},
	'microsoft-todo': {
		id: 'microsoft-todo',
		name: 'Microsoft Todo',
		icon: microsoftTodoIcon,
	},
	'vikunja-file': {
		id: 'vikunja-file',
		name: 'Vikunja Export',
		icon: vikunjaFileIcon,
		isFileMigrator: true,
	},
}