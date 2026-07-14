-- Fix the admin's WhatsApp session: link to the ORIGINAL profile (6acda2a3) not the duplicate (9f4c0f05)
UPDATE whatsapp_sessions 
SET user_id = '6acda2a3-854f-4b33-b55c-c0c45fd23587',
    last_message_context = jsonb_build_object(
      'name', 'Cliff Nhemachena',
      'location', 'Mashonaland West',
      'crops', 'Maize',
      'size', 10
    )
WHERE phone_number = 'whatsapp:+263710298949';

-- Remove the duplicate messaging_preferences entry (keep the original one linked to 6acda2a3)
DELETE FROM messaging_preferences WHERE user_id = '9f4c0f05-f064-4dc6-bb46-1d36d0e56996';

-- Remove the duplicate profile
DELETE FROM profiles WHERE id = '9f4c0f05-f064-4dc6-bb46-1d36d0e56996';

-- Remove any farms created for the duplicate
DELETE FROM farms WHERE user_id = '9f4c0f05-f064-4dc6-bb46-1d36d0e56996';