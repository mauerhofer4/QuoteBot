import 'dotenv/config';
import express from 'express';
import { ActivityType, Client } from 'discord.js';
import {
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
  getLatestQuotes,
  getQuote,
  editQuote,
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
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: resp.ok ? '🏓 Pong!' : '⚠️ API unreachable.' } });
      } catch {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '⚠️ API unreachable.' } });
      }
    }

    // Random quote
    if (name === 'quote') {
      try {
        const quote = await fetchGuildRandomQuote(API_BASE_URL, guildId);
        let content = quote.quotetext;
        if (quote.context) content = `**Context:** ${quote.context}\n\n${content}`;
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content } });
      } catch {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'No quotes found.' } });
      }
    }

    // Search
    if (name === 'searchquote') {
      const query = data.options.find(opt => opt.name === 'query')?.value;
      try {
        const quotes = await searchGuildQuotes(API_BASE_URL, guildId, query);
        const content = quotes.slice(0, 5).map(q =>
          `**ID:** \`${q.id}\`\n**Context:** ${q.context || 'None'}\n${q.quotetext}`
        ).join('\n\n') || 'No results.';
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content } });
      } catch {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Search failed.' } });
      }
    }

    // Add quote — open modal pre-populated with one example line
    if (name === 'addquote') {
      if (!hasStaffRole(req.body.member)) {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Staff only.' } });
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

    // Latest quotes
    if (name === 'latestquotes') {
      try {
        const quotes = await getLatestQuotes(API_BASE_URL, guildId);
        const content = quotes.map(q =>
          `**ID:** \`${q.id}\`\n**Context:** ${q.context || 'None'}\n${q.quotetext}`
        ).join('\n\n') || 'No quotes.';
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content } });
      } catch {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Error fetching quotes.' } });
      }
    }

    // List quotes (paginated)
    if (name === 'listquotes') {
      const page = data.options?.find(opt => opt.name === 'page')?.value || 1;
      try {
        const quotes = await listGuildQuotes(API_BASE_URL, guildId, page);
        const content = quotes.map(q =>
          `**ID:** \`${q.id}\`\n**Context:** ${q.context || 'None'}\n${q.quotetext}`
        ).join('\n\n') || 'No quotes.';
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: `Page ${page}\n\n${content}` } });
      } catch {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Error fetching quotes.' } });
      }
    }

    // Edit quote — pre-fill modal with existing data
    if (name === 'editquote') {
      if (!hasStaffRole(req.body.member)) {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Staff only.' } });
      }
      const quoteId = data.options.find(opt => opt.name === 'quote_id')?.value;
      try {
        const quote = await getQuote(API_BASE_URL, quoteId);
        if (quote.guild_id !== guildId) {
          return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Quote not from this guild.' } });
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
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Quote not found.' } });
      }
    }

    // Delete quote
    if (name === 'deletequote') {
      if (!hasStaffRole(req.body.member)) {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Staff only.' } });
      }
      const quoteId = data.options.find(opt => opt.name === 'quote_id')?.value;
      try {
        const quote = await getQuote(API_BASE_URL, quoteId);
        if (quote.guild_id !== guildId) {
          return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Quote not from this guild.' } });
        }
        await deleteQuote(API_BASE_URL, quoteId);
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Quote deleted.' } });
      } catch {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Delete failed or not found.' } });
      }
    }
  }

  // ── Modal submissions ─────────────────────────────────────────────────────
  if (type === InteractionType.MODAL_SUBMIT) {
    if (!hasStaffRole(req.body.member)) {
      return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Staff only.' } });
    }

    // Both create and edit modals share the same 3-component layout built by
    // buildQuoteModal(), so parsing is identical for both.
    const author   = data.components[0].components[0].value.trim();
    const context  = data.components[1].components[0].value?.trim() || null;
    const linesRaw = data.components[2].components[0].value;
    const lines    = parseCompactLines(linesRaw);

    if (lines.length === 0) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '❌ No valid lines found. Each line must follow the format:\n`Speaker (Nickname): Quote text`\nor\n`Speaker: Quote text`',
        },
      });
    }

    // Create
    if (data.custom_id === 'quote_create_modal') {
      try {
        await createQuote(API_BASE_URL, { guild_id: guildId, author, context, lines });
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `✅ Quote created with ${lines.length} line${lines.length !== 1 ? 's' : ''}!` },
        });
      } catch (e) {
        console.error('Create error:', e);
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed to create quote.' } });
      }
    }

    // Edit
    if (data.custom_id.startsWith('quote_edit_modal:')) {
      const quoteId = data.custom_id.split(':')[1];
      try {
        await editQuote(API_BASE_URL, quoteId, { author, context, lines });
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `✅ Quote updated (${lines.length} line${lines.length !== 1 ? 's' : ''})!` },
        });
      } catch (e) {
        console.error('Edit error:', e);
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed to update quote.' } });
      }
    }
  }

  return res.status(400).json({ error: 'unknown interaction' });
});

app.listen(PORT, () => console.log('Listening on port', PORT));