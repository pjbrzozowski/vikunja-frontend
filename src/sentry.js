export default async function setupSentry(app, router) {
	const Sentry = await import('@sentry/vue')
	const {Integrations} = await import('@sentry/tracing')

	Sentry.init({
		app,
		dsn: window.SENTRY_DSN,
		integrations: [
			new Integrations.BrowserTracing({
				routingInstrumentation: Sentry.vueRouterInstrumentation(router),
				tracingOrigins: ['localhost', /^\//],
			}),
		],
		tracesSampleRate: 1.0,
	})
}