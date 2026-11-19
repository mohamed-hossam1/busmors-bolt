import CalendarPage from '@/screens/CalendarPage'
import { loadPosts } from '@/server/calendar-actions'
export default async function Page() { return <CalendarPage initial={await loadPosts()} /> }
