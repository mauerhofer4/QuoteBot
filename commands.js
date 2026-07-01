import 'dotenv/config';
import { InstallGuildCommands } from './utils.js';

const QUOTE_COMMAND = {
  name: 'quote',
  description: 'Get a random quote from this server',
  type: 1,
  integration_types: [0,1],
  contexts: [0],
};

const SEARCHQUOTE_COMMAND = {
  name: 'searchquote',
  description: 'Search quotes in this server',
  type: 1,
  integration_types: [0,1],
  contexts: [0],
  options: [{ name: 'query', description: 'Search term', type: 3, required: true }],
};

const ADDQUOTE_COMMAND = {
  name: 'addquote',
  description: 'Create multi-line quote (staff only)',
  type: 1,
  integration_types: [0,1],
  contexts: [0],
};

const LATESTQUOTES_COMMAND = {
  name: 'latestquotes',
  description: 'Show latest 5 quotes from this server',
  type: 1,
  integration_types: [0,1],
  contexts: [0],
};

const LISTQUOTES_COMMAND = {
  name: 'listquotes',
  description: 'List all quotes from this server (paginated)',
  type: 1,
  integration_types: [0,1],
  contexts: [0],
  options: [{ name: 'page', description: 'Page number (default 1)', type: 4, min_value: 1 }],
};

const EDITQUOTE_COMMAND = {
  name: 'editquote',
  description: 'Edit quote by ID (staff only)',
  type: 1,
  integration_types: [0,1],
  contexts: [0],
  options: [{ name: 'quote_id', description: 'Quote UUID', type: 3, required: true }],
};

const DELETEQUOTE_COMMAND = {
  name: 'deletequote',
  description: 'Delete quote by ID (staff only)',
  type: 1,
  integration_types: [0,1],
  contexts: [0],
  options: [{ name: 'quote_id', description: 'Quote UUID', type: 3, required: true }],
};

const PING_COMMAND = {
  name: 'ping',
  description: 'Check if the bot is responsive',
  type: 1,
  integration_types: [0,1],
  contexts: [0,1,2],
};

const ALL_COMMANDS = [QUOTE_COMMAND, SEARCHQUOTE_COMMAND, ADDQUOTE_COMMAND, LATESTQUOTES_COMMAND, LISTQUOTES_COMMAND, EDITQUOTE_COMMAND, DELETEQUOTE_COMMAND, PING_COMMAND];

InstallGuildCommands(process.env.APP_ID, process.env.GUILD_ID, ALL_COMMANDS);