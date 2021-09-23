import { BuiltLogic } from 'kea'
import { mockAPI } from 'lib/api.mock'
import { expectLogic, initKeaTestLogic } from '~/test/kea-test-utils'
import { trendsLogic } from 'scenes/trends/trendsLogic'
import { trendsLogicType } from 'scenes/trends/trendsLogicType'
import { PropertyOperator } from '~/types'

jest.mock('lib/api')

describe('trendsLogic', () => {
    let logic: BuiltLogic<trendsLogicType>

    mockAPI(async ({ pathname, searchParams }) => {
        if (pathname === '_preflight/') {
            return { is_clickhouse_enabled: true }
        } else if (pathname === 'api/users/@me/') {
            return { organization: {}, team: { ingested_event: true, completed_snippet_onboarding: true } }
        } else if (
            [
                'api/action/',
                'api/projects/@current/event_definitions/',
                'api/users/@me/',
                'api/dashboard',
                'api/insight',
            ].includes(pathname)
        ) {
            return { results: [] }
        } else if (['api/insight/session/', 'api/insight/trend/'].includes(pathname)) {
            return { result: ['result from api'] }
        } else {
            debugger
            throw new Error(`Unmocked fetch to: ${pathname} with params: ${JSON.stringify(searchParams)}`)
        }
    })

    describe('core assumptions', () => {
        initKeaTestLogic({
            logic: trendsLogic,
            props: {},
            onLogic: (l) => (logic = l),
        })

        it('loads results on mount', async () => {
            await expectLogic(logic).toDispatchActions(['loadResults'])
        })
    })

    describe('as dashboard item', () => {
        describe('props with filters and cached results', () => {
            initKeaTestLogic({
                logic: trendsLogic,
                props: {
                    dashboardItemId: 123,
                    cachedResults: ['cached result'],
                    filters: {
                        events: [{ id: 2 }],
                        properties: [{ value: 'lol', operator: PropertyOperator.Exact, key: 'lol', type: 'lol' }],
                    },
                },
                onLogic: (l) => (logic = l),
            })

            it('no query to load results', async () => {
                await expectLogic(logic)
                    .toMatchValues({
                        results: ['cached result'],
                        filters: expect.objectContaining({
                            events: [{ id: 2 }],
                            properties: [expect.objectContaining({ type: 'lol' })],
                        }),
                    })
                    .toDispatchActions(['loadResultsSuccess']) // this took the cached results
                    .toMatchValues({
                        results: ['cached result'], // should not have changed
                        filters: expect.objectContaining({
                            events: [{ id: 2 }],
                            properties: [expect.objectContaining({ value: 'lol' })],
                        }),
                    })
            })
        })

        describe('props with filters, no cached results', () => {
            initKeaTestLogic({
                logic: trendsLogic,
                props: {
                    dashboardItemId: 123,
                    cachedResults: undefined,
                    filters: {
                        events: [{ id: 3 }],
                        properties: [{ value: 'a', operator: PropertyOperator.Exact, key: 'a', type: 'a' }],
                    },
                },
                onLogic: (l) => (logic = l),
            })

            it('makes a query to load the results', async () => {
                await expectLogic(logic)
                    .toDispatchActions(['loadResultsSuccess'])
                    .toMatchValues({
                        results: ['result from api'],
                        filters: expect.objectContaining({
                            events: [{ id: 3 }],
                            properties: [expect.objectContaining({ value: 'a' })],
                        }),
                    })
            })

            it('setCachedResults sets results directly', async () => {
                await expectLogic(logic).toDispatchActions(['loadResultsSuccess'])

                logic.actions.setCachedResults(
                    {
                        events: [{ id: 3 }],
                        properties: [{ value: 'lol', operator: PropertyOperator.Exact, key: 'lol', type: 'lol' }],
                    },
                    ['result']
                )

                await expectLogic(logic)
                    .toDispatchActions(['setCachedResults', 'setCachedResultsSuccess'])
                    .toMatchValues({
                        results: ['result'],
                        filters: expect.objectContaining({
                            events: [{ id: 3 }],
                            properties: [expect.objectContaining({ type: 'lol' })],
                        }),
                    })
            })
        })
    })
})
