/**
 * Types and Zod schemas for the newspaper-style Gist output.
 *
 * Claude outputs structured JSON matching NewspaperGistOutput.
 * The newspaperTemplate renders it into the 2-page broadsheet HTML.
 */

import { z } from 'zod';

// ─── Zod schemas ────────────────────────────────────────────────────────────

export const weatherForecastDaySchema = z.object({
  day: z.string(),           // e.g. "Tue"
  high: z.string(),          // e.g. "61°"
  condition: z.string().optional(), // e.g. "☂ 60%", "☀"
});

export const weatherSchema = z.object({
  tempNow: z.string(),       // e.g. "48°"
  conditions: z.string(),    // e.g. "Partly cloudy · High 58° · Sun breaks this afternoon"
  forecast: z.array(weatherForecastDaySchema).max(4),
});

export const rhythmsSchema = z.object({
  moon: z.string(),          // e.g. "Waxing Gibbous 91% · Full Wed"
  season: z.string(),        // e.g. "Early Spring, Day 10"
  light: z.string(),         // e.g. "12h 48m · Sunset 7:34"
  countdown: z.string().optional(), // e.g. "Thesis 38 days to defense"
});

export const ledeSchema = z.object({
  kicker: z.string(),        // e.g. "Good Morning, Riley"
  headline: z.string(),      // e.g. "Sun Breaks Today. The Days Are Long Again."
  paragraph: z.string(),     // Editorial paragraph, ~80-120 words
});

export const scheduleEventSchema = z.object({
  time: z.string(),          // e.g. "8:00a", "evening"
  emoji: z.string().optional(), // e.g. "📝", "☕"
  name: z.string(),          // e.g. "Writing block — Chapter 4"
  note: z.string(),          // Coaching note, e.g. "Aim for 800 words today."
});

export const notificationSchema = z.object({
  emoji: z.string(),         // e.g. "📧", "🎵", "📚"
  source: z.string(),        // e.g. "Dr. Kaur · Advisor"
  body: z.string(),          // The notification text with editorial voice
});

export const newsItemSchema = z.object({
  headline: z.string(),      // e.g. "Chile Creates Ocean Reserve the Size of Nigeria"
  summary: z.string(),       // Personalized one-liner connecting to user's life
});

export const personSchema = z.object({
  name: z.string(),          // e.g. "Dad"
  nudge: z.string(),         // e.g. "texted twice last week and you replied once..."
});

export const bodyMindSchema = z.object({
  sectionLabel: z.string(),  // e.g. "Body & Mind" or "Body & Training"
  title: z.string(),         // e.g. "The Light Is Coming Back"
  paragraphs: z.array(z.string()).min(1).max(3),
  coachingNote: z.string().optional(), // Italic coaching note
});

export const practiceArcSchema = z.object({
  sectionLabel: z.string(),  // e.g. "Thesis Arc" or "Practice & Business"
  title: z.string(),         // e.g. "38 Days to Defense"
  items: z.array(z.object({
    label: z.string(),       // Bold label e.g. "Chapter 3:"
    text: z.string(),        // Status/action text
  })).min(1).max(6),
  closingNote: z.string().optional(), // Optional summary line
});

export const moonHighlightSchema = z.object({
  title: z.string(),         // e.g. "The Moon Is Almost Full"
  paragraph: z.string(),     // Metaphorical paragraph connecting moon to user's life
});

export const closingQuoteSchema = z.object({
  text: z.string(),          // The quote text (without quotation marks)
  attribution: z.string(),   // e.g. "Ralph Waldo Emerson" or "The Gist, for Riley"
});

export const faxBackQuestionSchema = z.object({
  prompt: z.string(),        // e.g. "Did the thing ship?"
  options: z.array(z.string()).min(2).max(4), // e.g. ["Shipped", "In progress", "Blocked"]
});

export const qualityScoreSchema = z.object({
  editorialVoice: z.number().min(1).max(5),
  crossReferenceDepth: z.number().min(1).max(5),
  personalizationDepth: z.number().min(1).max(5),
});

// ─── Main output schema ─────────────────────────────────────────────────────

export const newspaperGistOutputSchema = z.object({
  // Page 1
  lede: ledeSchema,
  schedule: z.array(scheduleEventSchema).min(1).max(8),
  notifications: z.array(notificationSchema).min(1).max(6),
  goodNews: z.array(newsItemSchema).min(1).max(3),
  people: z.array(personSchema).min(1).max(4),
  quote: closingQuoteSchema,

  // Page 2
  bodyMind: bodyMindSchema,
  practiceArc: practiceArcSchema,
  moonHighlight: moonHighlightSchema,
  closingThought: z.string().optional(),
  faxBackQuestions: z.array(faxBackQuestionSchema).length(2),
  personalQuote: closingQuoteSchema,

  // Quality self-eval
  qualityScore: qualityScoreSchema,
});

export type NewspaperGistOutput = z.infer<typeof newspaperGistOutputSchema>;

// ─── Template input (enriched with non-LLM data) ───────────────────────────

export type NewspaperTemplateInput = NewspaperGistOutput & {
  /** Subscriber's display name */
  subscriberName: string;
  /** Subscriber's location, e.g. "Southeast Portland, Oregon" */
  location: string;
  /** Formatted date, e.g. "Monday, March 30, 2026" */
  dateFormatted: string;
  /** Delivery time, e.g. "7:00 AM PT" */
  deliveryTime: string;
  /** Volume/issue, e.g. "Vol. I · No. 12" */
  volumeIssue: string;
  /** Weather data (from connector, not LLM) */
  weather: z.infer<typeof weatherSchema>;
  /** Rhythms data (moon/season/light from connectors + countdown from prefs) */
  rhythms: z.infer<typeof rhythmsSchema>;
  /** Moon phase for footer, e.g. "Waxing Gibbous in Virgo" */
  moonFooter: string;
  /** Season for footer, e.g. "Early Spring" */
  seasonFooter: string;
  /** Morning intention prompt text */
  intentionPrompt: string;
};
