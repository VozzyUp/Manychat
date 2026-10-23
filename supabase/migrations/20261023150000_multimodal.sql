-- Build step 1.9 — multimodal (ESCOPO §4.6): text extracted from PDFs received on WhatsApp.
-- Audio transcriptions already live in messages.transcription (step 1.4).
alter table public.message_media add column extracted_text text;
