import BrainPage from '@/screens/BrainPage'
import { loadBrain } from '@/server/workspace-data'
export default async function Page() { return <BrainPage initial={await loadBrain()} /> }
