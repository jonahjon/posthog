import { kea } from 'kea'
import api from '../../lib/api'
import { Group, GroupType } from '../../types'
import { teamLogic } from '../teamLogic'
import { groupsLogicType } from './groupsLogicType'

export const groupsLogic = kea<groupsLogicType>({
    reducers: {
        currentGroupType: [
            null as string | null,
            {
                loadGroups: (_, groupType) => groupType,
            },
        ],
    },
    loaders: {
        groupTypes: [
            [] as GroupType[],
            {
                loadGroupTypes: async () => {
                    if (!teamLogic.values.currentTeam) {
                        return []
                    }
                    const response = await api.get(`api/projects/${teamLogic.values.currentTeam.id}/group_types`)
                    return response
                },
            },
        ],
        groups: [
            [] as Group[],
            {
                loadGroups: async (typeKey: string) => {
                    if (!teamLogic.values.currentTeam) {
                        return []
                    }
                    const response = await api.get(
                        `api/projects/${teamLogic.values.currentTeam.id}/group_types/${typeKey}/groups`
                    )
                    return response
                },
            },
        ],
    },
    urlToAction: ({ actions }) => ({
        '/groups': () => {
            actions.loadGroupTypes()
        },
        '/groups/:id': ({ id }) => {
            if (id) {
                actions.loadGroups(id)
            }
        },
    }),

    events: ({ actions }) => ({
        afterMount: () => {
            actions.loadGroupTypes()
        },
    }),
})
