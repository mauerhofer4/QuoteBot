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
  deleteQuote 
} from './botApi.js';

const PORT = process.env.PORT || 3000;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
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
  if (!member?.roles || !STAFF_ROLE_ID) return false;
  return member.roles.includes(STAFF_ROLE_ID);
}

app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  const { type, data } = req.body;

  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;
    const guildId = req.body.guild_id;

    // Health
    if (name === 'healthcheck') {
      try {
        const resp = await fetch(`${API_BASE_URL}/health`);
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: `API Health: ${resp.ok ? 'OK' : 'DOWN'}` } });
      } catch {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'API unreachable.' } });
      }
    }

    // Random quote
    if (name === 'quote') {
      try {
        const quote = await fetchGuildRandomQuote(API_BASE_URL, guildId);
        return res.send({ 
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, 
          data: { content: quote.quotetext } 
        });
      } catch {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'No quotes found.' } });
      }
    }

    // Search
    if (name === 'searchquote') {
      const query = data.options.find(opt => opt.name === 'query')?.value;
      try {
        const quotes = await searchGuildQuotes(API_BASE_URL, guildId, query);
        const content = quotes.slice(0, 5).map(q => `**${q.id}**\n${q.quotetext}`).join('\n\n') || 'No results.';
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content } });
      } catch {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Search failed.' } });
      }
    }

    // Add quote
    if (name === 'addquote') {
      if (!hasStaffRole(req.body.member)) {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Staff only.' } });
      }

      const numLines = Math.min(data.options.find(opt => opt.name === 'lines')?.value || 1, 1);  // Discord modal limit
      const author = req.body.member?.user?.username || 'Unknown';

      const components = [
        { type: 1, components: [{ type: 4, custom_id: 'author', label: 'Main Author', style: 1, value: author, required: true, max_length: 120 }] },
        { type: 1, components: [{ type: 4, custom_id: 'context', label: 'Context (optional)', style: 2, required: false, max_length: 4000 }] }
      ];

      for (let i = 1; i <= numLines; i++) {
        components.push(
          { type: 1, components: [{ type: 4, custom_id: `speaker_${i}`, label: `Speaker ${i}`, style: 1, required: true, max_length: 120 }] },
          { type: 1, components: [{ type: 4, custom_id: `line_${i}`, label: `Line ${i} Text`, style: 2, required: true, max_length: 4000 }] }
        );
      }

      return res.send({
        type: InteractionResponseType.MODAL,
        data: { 
          custom_id: 'quote_create_modal', 
          title: `Create Quote (${numLines} lines)`, 
          components 
        }
      });
    }

    // List
    if (name === 'listquotes') {
      try {
        const quotes = await listGuildQuotes(API_BASE_URL, guildId);
        const content = quotes.slice(0, 10).map(q => `**${q.id}**\n${q.quotetext}`).join('\n\n') || 'No quotes.';
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content } });
      } catch {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Error fetching quotes.' } });
      }
    }

    // Delete
    if (name === 'deletequote') {
      if (!hasStaffRole(req.body.member)) {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Staff only.' } });
      }
      const quoteId = data.options.find(opt => opt.name === 'quote_id')?.value;
      try {
        await deleteQuote(API_BASE_URL, quoteId);
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Quote deleted.' } });
      } catch {
        return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Delete failed.' } });
      }
    }
  }

  // === MODAL SUBMIT ===
  if (type === InteractionType.MODAL_SUBMIT && data.custom_id === 'quote_create_modal') {
    if (!hasStaffRole(req.body.member)) {
      return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Staff only.' } });
    }

    const author = data.components[0].components[0].value;
    const context = data.components[1].components[0].value || null;

    const lines = [];
    for (let i = 2; i < data.components.length; i += 2) {
      const speaker = data.components[i]?.components?.[0]?.value?.trim();
      const text = data.components[i + 1]?.components?.[0]?.value?.trim();
      if (speaker && text) {
        lines.push({ speaker, text, nickname: null });
      }
    }

    if (lines.length === 0) {
      return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'At least one line required.' } });
    }

    try {
      await createQuote(API_BASE_URL, { 
        guild_id: req.body.guild_id, 
        author, 
        context, 
        lines 
      });
      return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '✅ Quote created!' } });
    } catch (e) {
      console.error('Create quote error:', e);
      return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Failed to create quote.' } });
    }
  }

  return res.status(400).json({ error: 'unknown interaction' });
});

app.listen(PORT, () => console.log('Listening on port', PORT));