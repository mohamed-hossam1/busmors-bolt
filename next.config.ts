import type { NextConfig } from 'next'
const config: NextConfig = {
  distDir: process.env.NEXT_TEST_OUTPUT || '.next',
  async redirects() {
    return [
      { source: '/app', destination: '/employee', permanent: true },
      { source: '/app/calendar', destination: '/scheduling', permanent: true },
      ...['employee', 'brain', 'roadmap', 'deliverables', 'settings'].map(path => ({ source: '/app/' + path, destination: '/' + path, permanent: true })),
    ]
  },
}
export default config
