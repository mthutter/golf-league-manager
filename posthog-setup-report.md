<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Bottoms Up Golf League Manager — a Node.js/Express application. A shared PostHog client was created in `utilities/posthog.js` and imported into seven controller files and the error middleware. Twelve business-critical events are now captured server-side, covering authentication, score entry, player management, tee-time generation, skins calculation, handicap runs, blog publishing, and bulk email broadcasting. User identification fires on every successful login, tagging each session with a `role` person property (`admin` or `member`). Unhandled exceptions are forwarded to PostHog via `captureException` in the central error middleware.

| Event | Description | File |
|---|---|---|
| `user_logged_in` | Fires when an admin or league member successfully authenticates. | `controllers/auth.controller.js` |
| `login_failed` | Fires when a login attempt fails due to invalid credentials. | `controllers/auth.controller.js` |
| `user_logged_out` | Fires when a user destroys their session and logs out. | `controllers/auth.controller.js` |
| `score_saved` | Fires when a weekly score record is successfully saved for a player. | `controllers/scores.controller.js` |
| `player_created` | Fires when a new league player record is added to the roster. | `controllers/players.controller.js` |
| `player_updated` | Fires when an existing player's profile details are modified. | `controllers/players.controller.js` |
| `groupings_generated` | Fires when random tee-time groups are generated for a specific week. | `controllers/grouping.controller.js` |
| `players_swapped` | Fires when an admin manually swaps two players' positions in tee-time groupings. | `controllers/grouping.controller.js` |
| `skins_calculated` | Fires when the skins algorithm is executed and results are saved for a week. | `controllers/skins.controller.js` |
| `handicaps_calculated` | Fires when the admin triggers the league handicap calculation engine. | `controllers/admin.controller.js` |
| `blog_post_created` | Fires when a new blog post is successfully published to the site. | `controllers/blog.controller.js` |
| `email_broadcast_sent` | Fires when a bulk email is successfully dispatched to league members. | `controllers/email.controller.js` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/504994/dashboard/1823596)
- [User logins by role (wizard)](https://us.posthog.com/project/504994/insights/YqEfcvPS)
- [Score submissions trend (wizard)](https://us.posthog.com/project/504994/insights/jHxHBN6i)
- [Admin workflow funnel (wizard)](https://us.posthog.com/project/504994/insights/vWuwB16l)
- [Admin actions overview (wizard)](https://us.posthog.com/project/504994/insights/zhIUMUkn)
- [Failed logins (wizard)](https://us.posthog.com/project/504994/insights/BhvamVAb)

## Verify before merging

- [ ] Run a full production build (the wizard only verified the files it touched) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` to `.env.example` and any bootstrap/onboarding scripts so collaborators know what to set. *(Already added to `.env.example` in this run — verify it matches your deployment environment naming.)*
- [ ] Confirm the returning-visitor path also calls `identify` — the current implementation identifies on fresh login only, which can leave returning sessions (cookie still valid, no new login) on anonymous distinct IDs until the next explicit login.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-javascript_node/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
