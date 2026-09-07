# Marketplace assistant screenshot evidence

The local Playwright run used the real Express server and SQLite data plane. It registered `صيدلية النور - اختبار Marketplace` through `POST /api/platform/auth/register`, then opened `/`, opened the assistant, entered `صيدلية`, and submitted the query. The assistant called `/api/platform/marketplace/directory?query=صيدلية&category=` and rendered one result with the business name and status. The result was clickable and the test verified the corresponding main listing card became in-viewport. Screenshot: `marketplace-assistant-search.png`.

Run result: 1 passed (3.5s).
