import { useCopy } from '../../hooks/useCopy'

export interface PostPreviewData {
  platform: string
  caption: string
  hashtags?: string | null
  image_url?: string | null
  scheduled_for?: string | null
}

export function PostPreviewCard({ post, compact }: { post: PostPreviewData; compact?: boolean }) {
  const { t } = useCopy()
  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white p-3.5 shadow-sm hover:shadow-card transition-shadow" dir="auto">
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-ink-100 pb-2">
        <span className="badge bg-primary-50 text-primary-800 font-semibold text-[11px]">
          {t(`platform_${post.platform}` as never)}
        </span>
        {post.scheduled_for && (
          <span className="text-[11px] text-ink-400 font-normal">
            {new Date(post.scheduled_for).toLocaleDateString()}
          </span>
        )}
      </div>
      <p className={`text-xs leading-relaxed text-ink-800 font-normal ${compact ? 'line-clamp-3' : ''}`}>
        {post.caption}
      </p>
      {post.hashtags && (
        <p className="mt-2 text-[11px] font-medium text-primary-700 leading-normal" dir="ltr">
          {post.hashtags}
        </p>
      )}
    </div>
  )
}
