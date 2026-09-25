export interface NavItem {
  name: string
  url: string
}

export interface SocialItem {
  name: string
  url: string
}

export interface SiteSettings {
  title: string
  subtitle: string
  description: string
  navigation: NavItem[]
  social: SocialItem[]
  footer: string
  icp: string
  momentsTitle: string
  momentsSignature: string
  guestbookEnabled: boolean
  commentEnabled: boolean
  postsPerPage: number
  theme: string
}

export const defaultSiteSettings: SiteSettings = {
  title: '太平',
  subtitle: 'Tai-Ping',
  description: '太平的轻量博客',
  navigation: [
    { name: '首页', url: '/' },
    { name: '归档', url: '/archives' },
    { name: '分类', url: '/categories' },
    { name: '标签', url: '/tags' },
    { name: '说说', url: '/moments' },
    { name: '留言板', url: '/guestbook' },
  ],
  social: [],
  footer: '静水流深',
  icp: '',
  momentsTitle: '说说',
  momentsSignature: '随手记下的片刻',
  guestbookEnabled: true,
  commentEnabled: true,
  postsPerPage: 10,
  theme: 'zhuosu',
}
