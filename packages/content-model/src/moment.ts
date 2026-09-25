export interface MomentPicture {
  url: string
  alt?: string
}

export interface Moment {
  id: string
  content: string
  contentHtml: string
  author?: string
  pictures: MomentPicture[]
  videoUrl?: string
  linkUrl?: string
  linkText?: string
  tagNames: string[]
  createdAt: string
}
