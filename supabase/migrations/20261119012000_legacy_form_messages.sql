-- Legacy `form` messages keep their content but render through the structured
-- card. They predate Task input schemas, so mark them historical: the UI must
-- not offer a submit action that cannot resume a Task.
UPDATE messages
SET type = 'structured_form',
    payload = coalesce(payload, '{}'::jsonb) || '{"legacy":true}'::jsonb
WHERE type = 'form';
