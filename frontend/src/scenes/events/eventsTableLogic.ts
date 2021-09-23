import { kea } from 'kea'
import { errorToast, objectsEqual, toParams } from 'lib/utils'
import { router } from 'kea-router'
import api from 'lib/api'
import dayjs from 'dayjs'
import { userLogic } from 'scenes/userLogic'

import { eventsTableLogicType } from './eventsTableLogicType'
import { FixedFilters } from 'scenes/events/EventsTable'
import { tableConfigLogic } from 'lib/components/ResizableTable/tableConfigLogic'
import LocalizedFormat from 'dayjs/plugin/localizedFormat'
const POLL_TIMEOUT = 5000

// necessary for the date format in the formatEvents method to work
// doesn't matter if it is called multiple times but must be called once
dayjs.extend(LocalizedFormat)

const formatEvents = (
    events: EventsTableEvent[],
    newEvents: EventsTableEvent[],
    apiUrl: string | undefined
): EventsTableEvent[] => {
    let eventsFormatted: any[] = []
    if (!apiUrl) {
        eventsFormatted = [...events.map((event) => ({ event }))]
    } else {
        eventsFormatted = [
            ...events.map((item) => ({
                event: { ...item.event, actionName: item.action.name, actionId: item.action.id },
            })),
        ]
    }
    eventsFormatted.forEach((event, index) => {
        if (
            index > 0 &&
            eventsFormatted[index - 1].event &&
            !dayjs(event.event.timestamp).isSame(eventsFormatted[index - 1].event.timestamp, 'day')
        ) {
            eventsFormatted.splice(index, 0, { date_break: dayjs(event.event.timestamp).format('LL') })
        }
    })
    if (newEvents.length > 0) {
        eventsFormatted.splice(0, 0, { new_events: true })
    }
    return eventsFormatted
}

export interface EventsTableLogicProps {
    fixedFilters?: FixedFilters
    apiUrl?: string
    live?: boolean
    key?: string
}

interface EventsTableAction {
    name: string
    id: string
}

export interface EventsTableEvent {
    id: string
    event?: EventsTableEvent
    action: EventsTableAction
    timestamp?: string
}

interface OnFetchEventsSuccess {
    events: EventsTableEvent[]
    hasNext: boolean
    isNext: boolean
}

// props:
// - fixedFilters
// - apiUrl = 'api/event/'
// - live = false
export const eventsTableLogic = kea<eventsTableLogicType<EventsTableEvent, EventsTableLogicProps>>({
    props: {} as EventsTableLogicProps,
    // Set a unique key based on the fixed filters.
    // This way if we move back/forward between /events and /person/ID, the logic is reloaded.
    key: (props) =>
        [
            props.fixedFilters ? JSON.stringify(props.fixedFilters) : 'all',
            props.apiUrl || 'events',
            props.live ? 'live' : '',
            props.key,
        ].join('-'),

    actions: () => ({
        setProperties: (properties: []) => {
            // there seem to be multiple representations of "empty" properties
            // the page does not work with some of those representations
            // this action normalises them
            if (Array.isArray(properties)) {
                if (properties.length === 0) {
                    return { properties: [{}] }
                } else {
                    return { properties }
                }
            } else {
                return { properties: [properties] }
            }
        },
        setColumnConfig: (columnConfig: string[]) => ({ columnConfig }),
        setColumnConfigSaving: (saving: boolean) => ({ saving }),
        fetchEvents: (nextParams = null) => ({ nextParams }),
        fetchEventsSuccess: (x: OnFetchEventsSuccess) => x,
        fetchNextEvents: true,
        fetchOrPollFailure: (error: Error) => ({ error }),
        flipSort: true,
        pollEvents: true,
        pollEventsSuccess: (events: EventsTableEvent[]) => ({ events }),
        prependNewEvents: (events: EventsTableEvent[]) => ({ events }),
        setSelectedEvent: (selectedEvent: EventsTableEvent) => ({ selectedEvent }),
        setPollTimeout: (pollTimeout: number) => ({ pollTimeout }),
        setDelayedLoading: true,
        setEventFilter: (event: string) => ({ event }),
        toggleAutomaticLoad: (automaticLoadEnabled: boolean) => ({ automaticLoadEnabled }),
    }),

    reducers: () => ({
        // save the pathname that was used when this logic was mounted
        // we use it to NOT update the filters when the user moves away from this path, yet the scene is still active
        initialPathname: [(state: string) => router.selectors.location(state).pathname, { noop: (a: string) => a }],
        properties: [
            [],
            {
                setProperties: (
                    _: [],
                    {
                        properties,
                    }: {
                        properties: []
                    }
                ) => properties,
            },
        ],
        eventFilter: [
            '',
            {
                setEventFilter: (_: string, { event }: { event: string }) => event,
            },
        ],
        isLoading: [
            false,
            {
                fetchEvents: (state: boolean) => state,
                setDelayedLoading: () => true,
                fetchEventsSuccess: () => false,
                fetchOrPollFailure: () => false,
            },
        ],
        isLoadingNext: [
            false,
            {
                fetchNextEvents: () => true,
                fetchEventsSuccess: () => false,
            },
        ],
        events: [
            [] as EventsTableEvent[],
            {
                fetchEventsSuccess: (state: EventsTableEvent[], { events, isNext }: OnFetchEventsSuccess) =>
                    isNext ? [...state, ...events] : events,
                prependNewEvents: (
                    state: EventsTableEvent[],
                    {
                        events,
                    }: {
                        events: EventsTableEvent[]
                    }
                ) => [...events, ...state],
            },
        ],

        hasNext: [
            false,
            {
                fetchEvents: () => false,
                fetchNextEvents: () => false,
                fetchEventsSuccess: (_: boolean, { hasNext }: OnFetchEventsSuccess) => hasNext,
            },
        ],
        orderBy: ['-timestamp', { flipSort: (state: string) => (state === 'timestamp' ? '-timestamp' : 'timestamp') }],
        selectedEvent: [
            (null as unknown) as EventsTableEvent,
            {
                setSelectedEvent: (_: EventsTableEvent, { selectedEvent }: { selectedEvent: EventsTableEvent }) =>
                    selectedEvent,
            },
        ],
        newEvents: [
            [] as EventsTableEvent[],
            {
                setProperties: () => [],
                pollEventsSuccess: (
                    _: EventsTableEvent[],
                    {
                        events,
                    }: {
                        events: EventsTableEvent[]
                    }
                ) => events || [],
                prependNewEvents: () => [],
            },
        ],
        highlightEvents: [
            {} as Record<string, boolean>,
            {
                pollEventsSuccess: () => ({}),
                prependNewEvents: (
                    _: Record<string, boolean>,
                    {
                        events,
                    }: {
                        events: EventsTableEvent[]
                    }
                ) => {
                    return events.reduce((highlightEvents, event) => {
                        highlightEvents[event.id] = true
                        return highlightEvents
                    }, {} as Record<string, boolean>)
                },
            },
        ],
        pollTimeout: [
            -1,
            {
                setPollTimeout: (
                    _: number,
                    {
                        pollTimeout,
                    }: {
                        pollTimeout: number
                    }
                ) => pollTimeout,
            },
        ],
        columnConfigSaving: [
            false,
            {
                setColumnConfigSaving: (
                    _: boolean,
                    {
                        saving,
                    }: {
                        saving: boolean
                    }
                ) => saving,
            },
        ],
        automaticLoadEnabled: [
            false,
            {
                toggleAutomaticLoad: (
                    _: boolean,
                    {
                        automaticLoadEnabled,
                    }: {
                        automaticLoadEnabled: boolean
                    }
                ) => automaticLoadEnabled,
            },
        ],
    }),

    selectors: ({ selectors, props }) => ({
        eventsFormatted: [
            () => [selectors.events, selectors.newEvents],
            (events, newEvents) => formatEvents(events, newEvents, props.apiUrl),
        ],
        columnConfig: [() => [userLogic.selectors.user], (user) => user?.events_column_config?.active || 'DEFAULT'],
        exportUrl: [
            () => [selectors.eventFilter, selectors.orderBy, selectors.properties],
            (eventFilter, orderBy, properties) =>
                `/api/event.csv?${toParams({
                    properties,
                    ...((props.fixedFilters as FixedFilters) || {}),
                    ...(eventFilter ? { event: eventFilter } : {}),
                    orderBy: [orderBy],
                })}`,
        ],
    }),

    events: ({ values }) => ({
        // No afterMount necessary because actionToUrl will call
        beforeUnmount: () => {
            if (values.pollTimeout !== null) {
                clearTimeout(values.pollTimeout)
            }
        },
    }),

    actionToUrl: ({ values }) => ({
        setProperties: () => {
            return [
                router.values.location.pathname,
                {
                    ...router.values.searchParams,
                    properties: values.properties,
                },
                router.values.hashParams,
                { replace: true },
            ]
        },
        toggleAutomaticLoad: () => {
            return [
                router.values.location.pathname,
                {
                    ...router.values.searchParams,
                    autoload: values.automaticLoadEnabled,
                },
                router.values.hashParams,
                { replace: true },
            ]
        },
        setEventFilter: () => {
            return [
                router.values.location.pathname,
                {
                    ...router.values.searchParams,
                    eventFilter: values.eventFilter,
                },
                router.values.hashParams,
                { replace: true },
            ]
        },
    }),

    urlToAction: ({ actions, values }) => ({
        '*': (_, searchParams, hashParams) => {
            try {
                // if the url changed, but we are not anymore on the page we were at when the logic was mounted
                if (router.values.location.pathname !== values.initialPathname) {
                    return
                }
            } catch (error) {
                // since this is a catch-all route, this code might run during or after the logic was unmounted
                // if we have an error accessing the filter value, the logic is gone and we should return
                return
            }
            const isFirstRedirect = hashParams.backTo // first time we've navigated here from another page
            if (!objectsEqual(searchParams.properties || {}, values.properties) || isFirstRedirect) {
                actions.setProperties(searchParams.properties || {})
            }

            if (searchParams.autoload) {
                actions.toggleAutomaticLoad(searchParams.autoload)
            }

            if (searchParams.eventFilter) {
                actions.setEventFilter(searchParams.eventFilter)
            }
        },
    }),

    listeners: ({ actions, values, props }) => ({
        setColumnConfig: ({ columnConfig }) => {
            actions.setColumnConfigSaving(true)
            userLogic.actions.updateUser({ events_column_config: { active: columnConfig } })
        },
        setProperties: () => actions.fetchEvents(),
        flipSort: () => actions.fetchEvents(),
        setEventFilter: () => actions.fetchEvents(),
        fetchNextEvents: async () => {
            const { events, orderBy } = values

            if (events.length === 0) {
                actions.fetchEvents()
            } else {
                actions.fetchEvents({
                    [orderBy === 'timestamp' ? 'after' : 'before']: events[events.length - 1].timestamp,
                })
            }
        },
        fetchEvents: [
            async (_, breakpoint) => {
                if (values.events.length > 0) {
                    await breakpoint(500)
                }
                if (values.isLoading === null) {
                    actions.setDelayedLoading()
                }
            },
            async ({ nextParams }, breakpoint) => {
                clearTimeout(values.pollTimeout)

                const urlParams = toParams({
                    properties: values.properties,
                    ...(props.fixedFilters || {}),
                    ...(nextParams || {}),
                    ...(values.eventFilter ? { event: values.eventFilter } : {}),
                    orderBy: [values.orderBy],
                })

                let apiResponse = null

                try {
                    apiResponse = await api.get(`${props.apiUrl || 'api/event/'}?${urlParams}`)
                } catch (error) {
                    actions.fetchOrPollFailure(error)
                    return
                }

                breakpoint()
                actions.fetchEventsSuccess({
                    events: apiResponse.results,
                    hasNext: !!apiResponse.next,
                    isNext: !!nextParams,
                })

                actions.setPollTimeout(setTimeout(actions.pollEvents, POLL_TIMEOUT))
            },
        ],
        pollEvents: async (_, breakpoint) => {
            // Poll events when they are ordered in ascending order based on timestamp
            if (values.orderBy !== '-timestamp') {
                return
            }

            const params = {
                properties: values.properties,
                ...(props.fixedFilters || {}),
                ...(values.eventFilter ? { event: values.eventFilter } : {}),
                orderBy: [values.orderBy],
            }

            const event = values.events[0]

            if (event) {
                params.after = event.timestamp || event.event.timestamp
            }

            let events = null

            try {
                events = await api.get(`${props.apiUrl || 'api/event/'}?${toParams(params)}`)
            } catch (e) {
                // We don't call fetchOrPollFailure because we don't to generate an error alert for this
                return
            }

            breakpoint()

            if (values.automaticLoadEnabled || props.live) {
                actions.prependNewEvents(events.results)
            } else {
                actions.pollEventsSuccess(events.results)
            }

            actions.setPollTimeout(setTimeout(actions.pollEvents, POLL_TIMEOUT))
        },
        fetchOrPollFailure: ({ error }) => {
            errorToast(
                undefined,
                'There was a problem fetching your events. Please refresh this page to try again.',
                error.detail,
                error.code
            )
        },
        [userLogic.actionTypes.updateUserSuccess]: () => {
            actions.setColumnConfigSaving(false)
            tableConfigLogic.actions.setState(null)
        },
        [userLogic.actionTypes.updateUserFailure]: () => {
            actions.setColumnConfigSaving(false)
        },
        toggleAutomaticLoad: ({ automaticLoadEnabled }) => {
            if (automaticLoadEnabled && values.newEvents.length > 0) {
                actions.prependNewEvents(values.newEvents)
            }
        },
    }),
})
