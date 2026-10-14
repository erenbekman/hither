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
    viewer: {
      login: 'bob',
      name: 'Bob Builder',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=64',
      organizations: { nodes: [{ login: 'widgets' }] },
      followers: { totalCount: 42 },
      repositories: { totalCount: 101, nodes: [{ stargazerCount: 30 }, { stargazerCount: 7 }, {}] },
    },
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
    myPullRequests: {
      issueCount: 2,
      nodes: [
        pr(41, 'bob', 'User', { commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] } }),
        pr(42, 'bob', 'User', { commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] } }),
      ],
    },
    mentions: {
      issueCount: 2,
      nodes: [
        { ...pr(51, 'heidi'), __typename: 'Issue', url: 'https://github.com/bob/tools/issues/51' },
        { ...pr(52, 'ivan'), __typename: 'PullRequest' },
      ],
    },
    assigned: emptySearch,
    w0: {
      nameWithOwner: 'bob/site',
      defaultBranchRef: {
        name: 'main',
        target: {
          oid: 'abc123',
          url: 'https://github.com/bob/site/commit/abc123',
          messageHeadline: 'Bump deps',
          committedDate: '2026-10-14T11:00:00Z',
          author: { user: { login: 'bob' }, name: 'Bob' },
          statusCheckRollup: { state: 'ERROR' },
        },
      },
    },
    w1: null,
    rateLimit: { limit: 5000, remaining: 4990, resetAt: '2026-10-14T13:00:00Z', cost: 1 },
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
    mentions: emptySearch,
    assigned: emptySearch,
    rateLimit: { limit: 5000, remaining: 1, resetAt: '2026-10-14T13:00:00Z' },
    ...data,
  },
  ...extra,
})
