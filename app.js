import 'dotenv/config';
import express from 'express';
import { ActivityType, Client } from 'discord.js';
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import {
  fetchGuildRandomQuote,
  searchGuildQuotes,
  listGuildQuotes,
  createQuote,
  deleteQuote,
  getQuote,
  editQuote,
  getGuildQuoteCount,
  getSchedule,
  setSchedule,
  deleteSchedule,
  getDueSchedules,
  markScheduleSent,
} from './botApi.js';

const PORT = process.env.PORT || 3000;
const STAFF_ROLE_IDS = (process.env.STAFF_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const API_BASE_URL = (() => {
  const configuredUrl = process.env.API_BASE_URL || 'http://localhost:8000';
  try {
    const url = new URL(configuredUrl);
    if (url.hostname === 'api') {
      url.hostname = 'localhost';
      return url.toString().replace(/\/$/, '');
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return 'http://localhost:8000';
  }
})();

const app = express();

const client = new Client({ intents: [] });

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setPresence({ status: 'online', activities: [{ name: 'QuoteBot', type: ActivityType.Playing }] });
});

client.login(process.env.DISCORD_TOKEN).catch(console.error);

const SCHEDULE_CHECK_MS = 60 * 1000;
const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 };
const MAX_INTERVAL_MINUTES = 43200; // 30 days, matches the API limit

function formatQuote(quote) {
  return quote.context ? `**Context:** ${quote.context}\n\n${quote.quotetext}` : quote.quotetext;
}

const QUOTES_PER_PAGE = 5;
// The search query is stored in the button custom_id, which Discord caps at 100 characters.
const MAX_SEARCH_QUERY_LENGTH = 80;
// Discord caps the combined text of all embeds in a message at 6000 characters.
const MAX_QUOTE_PREVIEW_LENGTH = 1000;

function truncate(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function quoteEmbed(quote) {
  return { description: `${truncate(formatQuote(quote), MAX_QUOTE_PREVIEW_LENGTH)}\n\n**ID:** \`${quote.id}\`` };
}

/**
 * Button row for paginated quote messages. The custom_id carries everything needed
 * to render the target page (pg:<kind>:<button>:<page>[:<query>]), so clicks keep
 * working after a bot restart. The button name keeps custom_ids unique per message.
 */
function paginationRow(kind, page, totalPages, query) {
  const suffix = kind === 'search' ? `:${query}` : '';
  const button = (name, label, targetPage, disabled) => ({
    type: 2,
    style: 2,
    label,
    custom_id: `pg:${kind}:${name}:${targetPage}${suffix}`,
    disabled,
  });
  return {
    type: 1,
    components: [
      button('first', 'First', 1, page <= 1),
      button('prev', 'Previous', page - 1, page <= 1),
      button('page', `Page ${page} of ${totalPages}`, page, true),
      button('next', 'Next', page + 1, page >= totalPages),
      button('last', 'Last', totalPages, page >= totalPages),
    ],
  };
}

/**
 * Build the message for one page of quotes. kind is 'list', 'latest' or 'search'.
 * Out-of-range pages are clamped, so stale buttons still land on a valid page
 * after quotes were deleted.
 */
async function buildQuotePage(kind, guildId, requestedPage, query) {
  let total;
  let page;
  let quotes;

  if (kind === 'search') {
    const results = await searchGuildQuotes(API_BASE_URL, guildId, query);
    total = results.length;
    page = Math.min(Math.max(requestedPage, 1), Math.max(Math.ceil(total / QUOTES_PER_PAGE), 1));
    quotes = results.slice((page - 1) * QUOTES_PER_PAGE, page * QUOTES_PER_PAGE);
  } else {
    total = await getGuildQuoteCount(API_BASE_URL, guildId);
    page = Math.min(Math.max(requestedPage, 1), Math.max(Math.ceil(total / QUOTES_PER_PAGE), 1));
    quotes = total ? await listGuildQuotes(API_BASE_URL, guildId, page) : [];
  }

  if (!quotes.length) {
    return { content: kind === 'search' ? 'No results.' : 'No quotes.', embeds: [], components: [], allowed_mentions: { parse: [] } };
  }

  const totalPages = Math.max(Math.ceil(total / QUOTES_PER_PAGE), 1);
  const headers = {
    search: `Search results for "${query}" (${total})`,
    latest: `Latest quotes (${total} total)`,
    list: `All quotes (${total} total)`,
  };
  return {
    content: headers[kind],
    embeds: quotes.map(quoteEmbed),
    components: totalPages > 1 ? [paginationRow(kind, page, totalPages, query)] : [],
    allowed_mentions: { parse: [] },
  };
}

function formatInterval(minutes) {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`;
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * Every minute, ask the API which schedules are due and post a random quote for each.
 * Schedules live in the database, so they survive bot restarts. A schedule is marked as
 * sent even when posting fails (missing permissions, deleted channel, no quotes), so a
 * broken schedule doesn't retry every minute.
 */
let scheduleCheckRunning = false;
async function postDueScheduledQuotes() {
  if (scheduleCheckRunning || !client.isReady()) return;
  scheduleCheckRunning = true;
  try {
    const schedules = await getDueSchedules(API_BASE_URL);
    for (const schedule of schedules) {
      try {
        const quote = await fetchGuildRandomQuote(API_BASE_URL, schedule.guild_id);
        const channel = await client.channels.fetch(schedule.channel_id);
        await channel.send({ content: formatQuote(quote), allowedMentions: { parse: [] } });
      } catch (e) {
        console.error(`Scheduled quote for guild ${schedule.guild_id} failed:`, e.message);
      }
      await markScheduleSent(API_BASE_URL, schedule.guild_id);
    }
  } catch (e) {
    console.error('Schedule check failed:', e.message);
  } finally {
    scheduleCheckRunning = false;
  }
}

setInterval(postDueScheduledQuotes, SCHEDULE_CHECK_MS);

// Error replies are ephemeral: only the user who ran the command sees them.
function sendError(res, content) {
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: InteractionResponseFlags.EPHEMERAL },
  });
}

function hasStaffRole(member) {
  if (!member?.roles || !STAFF_ROLE_IDS.length) return false;
  return member.roles.some(role => STAFF_ROLE_IDS.includes(role));
}

/**
 * Parse the multi-line "Quote Lines" textarea.
 * Each non-blank line must follow one of these formats:
 *   Speaker: Quote text
 *   Speaker (Nickname): Quote text
 * Lines that don't match the format are silently skipped.
 */
function parseCompactLines(linesText) {
  return linesText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      // Capture: speaker, optional (nickname), colon, then the rest as text.
      // [^(:]+ stops at the first '(' or ':', so colons inside the text portion
      // are captured safely by (.+)$ at the end.
      const match = line.match(/^([^(:]+?)(?:\s*\(([^)]*)\))?\s*:\s*(.+)$/s);
      if (!match) return null;
      const nickname = match[2]?.trim() || null;
      return {
        speaker: match[1].trim(),
        nickname: nickname === '' ? null : nickname,
        text: match[3].trim(),
      };
    })
    .filter(Boolean);
}

/**
 * Build a 3-row Discord modal for creating or editing a quote.
 *
 * Why 3 rows instead of separate speaker/nickname/text rows per line?
 * Discord modals have a hard limit of 5 action rows.  With the old layout
 * (author + context + speaker + nickname + text per line) only 1 line ever
 * fit.  Putting all lines into a single multi-line textarea lifts that cap:
 * any number of lines (1-5+) work identically, and speaker+nickname are
 * preserved via the "Speaker (Nickname): text" format.
 */
function buildQuoteModal({ customId, title, authorValue, contextValue, linesValue }) {
  return {
    custom_id: customId,
    title,
    components: [
      {
        type: 1,
        components: [{
          type: 4,
          custom_id: 'author',
          label: 'Author (who recorded this quote)',
          style: 1,
          value: authorValue ?? '',
          required: true,
          max_length: 120,
        }],
      },
      {
        type: 1,
        components: [{
          type: 4,
          custom_id: 'context',
          label: 'Context (optional)',
          style: 2,
          value: contextValue ?? '',
          required: false,
          max_length: 4000,
          placeholder: 'Optional background info about when / where this was said…',
        }],
      },
      {
        type: 1,
        components: [{
          type: 4,
          custom_id: 'quote_lines',
          label: 'Quote Lines  —  Speaker (Nickname): text',
          style: 2,
          value: linesValue ?? '',
          required: true,
          max_length: 4000,
          placeholder: 'Alice (Al): Something memorable\nBob: His reply here',
        }],
      },
    ],
  };
}

app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  const { type, data } = req.body;
  const guildId = req.body.guild_id;

  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  // ── Slash commands ────────────────────────────────────────────────────────
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;

    // Ping
    if (name === 'ping') {
      try {
        const resp = await fetch(`${API_BASE_URL}/health`);
        if (!resp.ok) return sendError(res, 'API unreachable.');
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Pong!' } });
      } catch {
        return sendError(res, 'API unreachable.');
      }
    }

    // Random quote
    if (name === 'quote') {
      try {
        const quote = await fetchGuildRandomQuote(API_BASE_URL, guildId);
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: formatQuote(quote) } });
      } catch {
        return sendError(res, 'No quotes found.');
      }
    }

    // Search
    if (name === 'searchquote') {
      const query = data.options.find(opt => opt.name === 'query')?.value;
      if (query.length > MAX_SEARCH_QUERY_LENGTH) {
        return sendError(res, `The search term can be at most ${MAX_SEARCH_QUERY_LENGTH} characters.`);
      }
      try {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: await buildQuotePage('search', guildId, 1, query) });
      } catch {
        return sendError(res, 'Search failed.');
      }
    }

    // Add quote — open modal pre-populated with one example line
    if (name === 'addquote') {
      if (!hasStaffRole(req.body.member)) {
        return sendError(res, 'Staff only.');
      }

      const authorDefault = req.body.member?.user?.username ?? '';

      return res.send({
        type: InteractionResponseType.MODAL,
        data: buildQuoteModal({
          customId: 'quote_create_modal',
          title: 'Add Quote',
          authorValue: authorDefault,
          contextValue: '',
          linesValue: 'Speaker 1: Text',
        }),
      });
    }

    // Latest quotes (paginated, starting at the newest)
    if (name === 'latestquotes') {
      try {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: await buildQuotePage('latest', guildId, 1) });
      } catch {
        return sendError(res, 'Error fetching quotes.');
      }
    }

    // List quotes (paginated)
    if (name === 'listquotes') {
      const page = data.options?.find(opt => opt.name === 'page')?.value || 1;
      try {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: await buildQuotePage('list', guildId, page) });
      } catch {
        return sendError(res, 'Error fetching quotes.');
      }
    }

    // Quote count
    if (name === 'quotecount') {
      try {
        const count = await getGuildQuoteCount(API_BASE_URL, guildId);
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: `This server has **${count}** quote${count === 1 ? '' : 's'}.` } });
      } catch {
        return sendError(res, 'Error fetching quote count.');
      }
    }

    // Scheduled quotes
    if (name === 'schedulequote') {
      const subcommand = data.options?.[0];
      const reply = content => res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content } });

      if (subcommand?.name !== 'status' && !hasStaffRole(req.body.member)) {
        return sendError(res, 'Staff only.');
      }

      try {
        if (subcommand?.name === 'set') {
          const channelId = subcommand.options.find(opt => opt.name === 'channel')?.value;
          const every = subcommand.options.find(opt => opt.name === 'every')?.value;
          const unit = subcommand.options.find(opt => opt.name === 'unit')?.value || 'hours';
          const intervalMinutes = every * UNIT_MINUTES[unit];
          if (intervalMinutes > MAX_INTERVAL_MINUTES) {
            return sendError(res, 'The interval can be at most 30 days.');
          }
          await setSchedule(API_BASE_URL, guildId, channelId, intervalMinutes);
          return reply(`A random quote will be posted in <#${channelId}> every ${formatInterval(intervalMinutes)}.`);
        }

        if (subcommand?.name === 'stop') {
          const deleted = await deleteSchedule(API_BASE_URL, guildId);
          return reply(deleted ? 'Scheduled quotes stopped.' : 'There is no quote schedule for this server.');
        }

        if (subcommand?.name === 'status') {
          const schedule = await getSchedule(API_BASE_URL, guildId);
          if (!schedule) return reply('There is no quote schedule for this server.');
          const nextAt = Math.floor((new Date(schedule.last_sent_at).getTime() + schedule.interval_minutes * 60000) / 1000);
          return reply(`Posting a random quote in <#${schedule.channel_id}> every ${formatInterval(schedule.interval_minutes)}.\nNext quote <t:${nextAt}:R>.`);
        }
      } catch (e) {
        console.error('Schedule error:', e);
        return sendError(res, 'Failed to update the quote schedule.');
      }
    }

    // Edit quote — pre-fill modal with existing data
    if (name === 'editquote') {
      if (!hasStaffRole(req.body.member)) {
        return sendError(res, 'Staff only.');
      }
      const quoteId = data.options.find(opt => opt.name === 'quote_id')?.value;
      try {
        const quote = await getQuote(API_BASE_URL, quoteId);
        if (quote.guild_id !== guildId) {
          return sendError(res, 'Quote not from this guild.');
        }

        // Serialise existing lines back into the compact textarea format so the
        // user can see and edit them exactly as they were saved.
        const existingLines = quote.lines
          .map(line => {
            const speakerPart = line.nickname ? `${line.speaker} (${line.nickname})` : line.speaker;
            return `${speakerPart}: ${line.text}`;
          })
          .join('\n');

        return res.send({
          type: InteractionResponseType.MODAL,
          data: buildQuoteModal({
            customId: `quote_edit_modal:${quoteId}`,
            title: 'Edit Quote',
            authorValue: quote.author,
            contextValue: quote.context ?? '',
            linesValue: existingLines,
          }),
        });
      } catch (e) {
        console.error(e);
        return sendError(res, 'Quote not found.');
      }
    }

    // Delete quote
    if (name === 'deletequote') {
      if (!hasStaffRole(req.body.member)) {
        return sendError(res, 'Staff only.');
      }
      const quoteId = data.options.find(opt => opt.name === 'quote_id')?.value;
      try {
        const quote = await getQuote(API_BASE_URL, quoteId);
        if (quote.guild_id !== guildId) {
          return sendError(res, 'Quote not from this guild.');
        }
        await deleteQuote(API_BASE_URL, quoteId);
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Quote deleted.' } });
      } catch {
        return sendError(res, 'Delete failed or not found.');
      }
    }
  }

  // ── Pagination buttons ────────────────────────────────────────────────────
  if (type === InteractionType.MESSAGE_COMPONENT && data.custom_id.startsWith('pg:')) {
    // custom_id: pg:<kind>:<button>:<page>[:<query>] (the query itself may contain colons)
    const [, kind, , pageValue, ...queryParts] = data.custom_id.split(':');
    const query = kind === 'search' ? queryParts.join(':') : undefined;
    try {
      return res.send({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: await buildQuotePage(kind, guildId, parseInt(pageValue, 10) || 1, query),
      });
    } catch (e) {
      console.error('Pagination error:', e);
      return sendError(res, 'Error fetching quotes.');
    }
  }

  // ── Modal submissions ─────────────────────────────────────────────────────
  if (type === InteractionType.MODAL_SUBMIT) {
    if (!hasStaffRole(req.body.member)) {
      return sendError(res, 'Staff only.');
    }

    // Both create and edit modals share the same 3-component layout built by
    // buildQuoteModal(), so parsing is identical for both.
    const author   = data.components[0].components[0].value.trim();
    const context  = data.components[1].components[0].value?.trim() || null;
    const linesRaw = data.components[2].components[0].value;
    const lines    = parseCompactLines(linesRaw);

    if (lines.length === 0) {
      return sendError(res, 'No valid lines found. Each line must follow the format:\n`Speaker (Nickname): Quote text`\nor\n`Speaker: Quote text`');
    }

    // Create
    if (data.custom_id === 'quote_create_modal') {
      try {
        const quote = await createQuote(API_BASE_URL, { guild_id: guildId, author, context, lines });
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: formatQuote(quote), allowed_mentions: { parse: [] } },
        });
      } catch (e) {
        console.error('Create error:', e);
        return sendError(res, 'Failed to create quote.');
      }
    }

    // Edit
    if (data.custom_id.startsWith('quote_edit_modal:')) {
      const quoteId = data.custom_id.split(':')[1];
      try {
        await editQuote(API_BASE_URL, quoteId, { author, context, lines });
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `Quote updated (${lines.length} line${lines.length !== 1 ? 's' : ''})!` },
        });
      } catch (e) {
        console.error('Edit error:', e);
        return sendError(res, 'Failed to update quote.');
      }
    }
  }

  return res.status(400).json({ error: 'unknown interaction' });
});

app.listen(PORT, () => console.log('Listening on port', PORT));