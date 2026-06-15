import 'dotenv/config';
import { InstallGlobalCommands, InstallGuildCommands } from './utils.js';

// Simple test command
const TEST_COMMAND = {
  name: 'test',
  description: 'Basic command',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Random quote command
const QUOTE_COMMAND = {
  name: 'quoterandom',
  description: 'Get a random quote',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Add a new quote (requires Zitateschreiber role)
const QUOTE_ADD_COMMAND = {
  name: 'quoteadd',
  description: 'Add a new quote (requires Zitateschreiber role)',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  default_member_permissions: '0',
  options: [
    {
      name: 'text',
      description: 'The quote text',
      type: 3,
      required: true,
      max_length: 4000,
    },
    {
      name: 'name',
      description: 'Who said the quote',
      type: 3,
      required: true,
      max_length: 120,
    },
    {
      name: 'context',
      description: 'Optional context for the quote',
      type: 3,
      required: false,
      max_length: 1000,
    },
    {
      name: 'nickname',
      description: 'Optional nickname for the author',
      type: 3,
      required: false,
      max_length: 120,
    },
  ],
};

// Edit an existing quote (requires Zitateschreiber role)
const QUOTE_EDIT_COMMAND = {
  name: 'quoteedit',
  description: 'Edit an existing quote (requires Zitateschreiber role)',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  default_member_permissions: '0',
  options: [
    {
      name: 'id',
      description: 'The ID of the quote to edit',
      type: 4,
      required: true,
    },
  ],
};

// Delete a quote (requires Zitateschreiber role)
const QUOTE_DELETE_COMMAND = {
  name: 'quotedelete',
  description: 'Delete a quote (requires Zitateschreiber role)',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  default_member_permissions: '0',
  options: [
    {
      name: 'id',
      description: 'The ID of the quote to delete',
      type: 4,
      required: true,
    },
  ],
};

// List all quotes
const QUOTE_LIST_COMMAND = {
  name: 'quotelist',
  description: 'List all quotes with pagination',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Get latest quotes
const QUOTE_LATEST_COMMAND = {
  name: 'quotelatest',
  description: 'Get the latest quotes',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Search quotes
const QUOTE_SEARCH_COMMAND = {
  name: 'quotesearch',
  description: 'Search quotes by text, author, name, or nickname',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  options: [
    {
      name: 'query',
      description: 'The search query',
      type: 3,
      required: true,
      max_length: 500,
    },
    {
      name: 'type',
      description: 'Search in: text, author, name, or nickname',
      type: 3,
      required: false,
      choices: [
        { name: 'Text', value: 'text' },
        { name: 'Author', value: 'author' },
        { name: 'Name', value: 'name' },
        { name: 'Nickname', value: 'nickname' },
      ],
    },
  ],
};

const ALL_COMMANDS = [
  TEST_COMMAND,
  QUOTE_COMMAND,
  QUOTE_ADD_COMMAND,
  QUOTE_EDIT_COMMAND,
  QUOTE_DELETE_COMMAND,
  QUOTE_LIST_COMMAND,
  QUOTE_LATEST_COMMAND,
  QUOTE_SEARCH_COMMAND,
];

// InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
InstallGuildCommands(process.env.APP_ID, process.env.GUILD_ID, ALL_COMMANDS);
