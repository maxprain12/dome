'use strict';

const CREATOR_REFERENCES_SQL = `
  SELECT r.* FROM social_references r
  WHERE r.project_id = ? AND EXISTS (
    SELECT 1 FROM social_watchlist_members m
    JOIN social_watchlists w ON w.id = m.watchlist_id
    WHERE w.project_id = r.project_id AND m.person_id = ? AND m.provider = r.provider
      AND (r.person_id = m.person_id
        OR rtrim(r.external_url, '/') = rtrim(m.profile_url, '/')
        OR (coalesce(m.handle, '') != '' AND
          lower(ltrim(m.handle, '@')) = lower(ltrim(
            json_extract(CASE WHEN json_valid(r.source_json) THEN r.source_json ELSE '{}' END, '$.authorHandle'), '@'))))
  )
  ORDER BY (r.format = 'profile') DESC,
    coalesce(json_extract(CASE WHEN json_valid(r.source_json) THEN r.source_json ELSE '{}' END, '$.publishedAt'), r.captured_at) DESC,
    r.id ASC
  LIMIT ? OFFSET ?
`;

module.exports = { CREATOR_REFERENCES_SQL };
