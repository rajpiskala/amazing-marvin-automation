export const API_BASE_URL = 'https://serv.amazingmarvin.com/api'
export const TIMEZONE_OFFSET = (-8 * 60) // TO-DO: Make calculation dynamic based on client and server 
export const UNASSIGNED_PARENT_ID = 'unassigned'
export const MarvinEndpoint = {
  ADD_TASK: `${API_BASE_URL}/addTask`,
  MARK_DONE: `${API_BASE_URL}/markDone`,
  UPDATE_HABIT: `${API_BASE_URL}/updateHabit`,
  LIST_HABITS_FULL: `${API_BASE_URL}/habits?raw=1`,
  LIST_GOALS: `${API_BASE_URL}/goals`,
  UPDATE_DOC: `${API_BASE_URL}/doc/update`,
} as const
