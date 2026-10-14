const pr = (number: number, author: string, typename = 'User', extra: Record<string, unknown> = {}) => ({
  number,
  title: `Change ${number}`,
  url: `https://github.com/bob/tools/pull/${number}`,
  createdAt: `2026-10-${String(number % 28 + 1).padStart(2, '0')}T09:00:00Z`,
  isDraft: false,
  author: { login: author, __typename: typename },
  repository: { nameWithOwner: 'bob/tools' },
  ...extra,
})

export const emptySearch = { issueCount: 0, nodes: [] }

export const response = {
  data: {
    viewer: { login: 'bob', organizations: { nodes: [{ login: 'widgets' }] } },
    prs: {
      issueCount: 3,
      nodes: [pr(11, 'carol'), pr(12, 'dependabot', 'Bot'), pr(13, 'dave', 'User', { isDraft: true })],
    },
    issues: {
      issueCount: 2,
      nodes: [
        { ...pr(21, 'erin'), url: 'https://github.com/bob/tools/issues/21' },
        { ...pr(22, 'ghost'), author: null },
      ],
    },
    review: { issueCount: 1, nodes: [pr(31, 'frank')] },
    changesRequested: { issueCount: 1, nodes: [pr(41, 'bob')] },
    myPullRequests: { issueCount: 2, nodes: [pr(41, 'bob'), pr(42, 'bob')] },
    rateLimit: { limit: 5000, remaining: 4990, resetAt: '2026-10-14T13:00:00Z' },
  },
}

export const withData = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  data: {
    viewer: { login: 'a' },
    prs: emptySearch,
    issues: emptySearch,
    review: emptySearch,
    changesRequested: emptySearch,
    myPullRequests: emptySearch,
    rateLimit: { limit: 5000, remaining: 1, resetAt: '2026-10-14T13:00:00Z' },
    ...data,
  },
  ...extra,
})
