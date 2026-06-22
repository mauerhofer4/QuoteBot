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
  description: 'Create quote (staff only)',
  type: 1,
  integration_types: [0,1],
  contexts: [0],
  options: [
    {
      name: 'lines',
      description: 'Number of quote lines (currently 1)',
      type: 4,
      required: true,
      min_value: 1,
      max_value: 1
    }
  ],
};

const LISTQUOTES_COMMAND = {
  name: 'listquotes',
  description: 'List latest 10 server quotes',
  type: 1,
  integration_types: [0,1],
  contexts: [0],
};

const DELETEQUOTE_COMMAND = {
  name: 'deletequote',
  description: 'Delete quote by ID (staff only)',
  type: 1,
  integration_types: [0,1],
  contexts: [0],
  options: [{ name: 'quote_id', description: 'Quote UUID', type: 3, required: true }],
};

const HEALTH_COMMAND = {
  name: 'healthcheck',
  description: 'Check API health',
  type: 1,
  integration_types: [0,1],
  contexts: [0,1,2],
};

const ALL_COMMANDS = [QUOTE_COMMAND, SEARCHQUOTE_COMMAND, ADDQUOTE_COMMAND, LISTQUOTES_COMMAND, DELETEQUOTE_COMMAND, HEALTH_COMMAND];

InstallGuildCommands(process.env.APP_ID, process.env.GUILD_ID, ALL_COMMANDS);