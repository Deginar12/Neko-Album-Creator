//
//  Landing pages
//

const express = require('express');
const app = express();

app.use(express.static('public'));

app.get("/", function(request, response) {
  response.sendFile(__dirname + '/index.html');
});

app.get("/", (request, response) => {
  response.sendStatus(200);
});

app.listen(process.env.PORT);

//
//  Bot libs and config
//
const Telegraf = require('telegraf')
const TelegrafI18n = require('telegraf-i18n')
const TelegrafLocalSession = require('telegraf-session-local')
const path = require('path')
var responseTimer = null
var fs = require('fs')

const Database = require("@replit/database")
const db = new Database()
db.empty()

// Clear users mediaQueue on bot Reset
var mySessions = require('./sessions.json')
mySessions.sessions.forEach((el) => {
  el.data.mediaQueue = []
})
let newJsonFile = JSON.stringify(mySessions)
fs.writeFileSync('./sessions.json', newJsonFile)

// Prepare i18n
const i18n = new TelegrafI18n({
  defaultLanguage: 'en',
  allowMissing: true,
  directory: path.resolve(__dirname, 'locales')
})

// Prepare sessions
const LocalSession = new TelegrafLocalSession({
  database: 'sessions.json'
})

// Create bot and load middlewares
const bot = new Telegraf(process.env.BOT_TOKEN)
bot.use(i18n.middleware())
bot.use(LocalSession.middleware())

//
//  Bot logic
//

bot.start((ctx) => {
  prepareSessionVars(ctx.session)
  const message = ctx.i18n.t('greeting', {
    username: ctx.from.username
  })
  return ctx.reply(message).catch(function(error) {
    if (error.response && error.response.statusCode === 403) {
      // ...snip...
    }
  });
})

bot.help(ctx => {
  ctx.reply(ctx.i18n.t('help'))
})

bot.settings(ctx => {
  ctx.reply(ctx.i18n.t('settings'))
})

bot.command('source', ctx => {
  ctx.reply(ctx.i18n.t('source'))
})

// Add album entries
bot.on('photo', (ctx) => {
  prepareSessionVars(ctx.session).then(() => {
    // Reset timeout (if multiple media is forwarded)
    clearTimeout(responseTimer);

    // Ensure a mediaQueue and timer exists in the user's session
    if (ctx.session.mediaQueue === undefined)
      ctx.session.mediaQueue = []

    //Add photo to album in session
    const imgFileId = ctx.message.photo.pop().file_id
    ctx.session.mediaQueue.push({ type: 'photo', media: imgFileId })

    // Reply
    responseTimer = setTimeout(function() {
      ctx.reply(ctx.i18n.t('album_done')).then(() => {
        createAlbum(ctx)
      })
    }, 500)
  })
})

// Add video entries
bot.on('video', (ctx) => {
  prepareSessionVars(ctx.session).then(() => {
    // Reset timeout (if multiple media is forwarded)
    clearTimeout(responseTimer);

    // Ensure a mediaQueue exists in the user's session
    if (ctx.session.mediaQueue === undefined)
      ctx.session.mediaQueue = []

    //Add video to album in session
    const vidFileId = ctx.message.video.file_id
    ctx.session.mediaQueue.push({ type: 'video', media: vidFileId })

    // Reply
    responseTimer = setTimeout(function() {
      ctx.reply(ctx.i18n.t('album_done')).then(() => {
        createAlbum(ctx)
      })
    }, 500)
  })
})

// Finish album creation
bot.hears(TelegrafI18n.match('keyboard_done'), (ctx) => {
  createAlbum(ctx)
})

// Clear media queue
bot.hears(TelegrafI18n.match('keyboard_clear'), (ctx) => {
  ctx.session.mediaQueue = []
  return ctx.reply(ctx.i18n.t('queue_cleared'))
})

// Ensure variables exists in the user's session
function prepareSessionVars(session) {
  return new Promise(function(resolve) {
    if (session.mediaQueue === undefined) {
      session.mediaQueue = []
    }
    resolve('ok')
  })
}

async function createAlbum({ i18n, reply, replyWithMediaGroup, session, update, telegram }) {
  // Return if only one media item is present
  if (!session.mediaQueue || session.mediaQueue.length < 1) {
    reply(i18n.t('not_enough_media_items'))
    return
  }

  // Remove media queue from session
  const queue = session.mediaQueue
  session.mediaQueue = []

  // split media into media groups
  let n = queue.length
  let pages = Math.ceil(n / 10)
  let ItemsPerPage = Math.floor(n / pages)
  let k = (n % pages) /* How many times we need to sneek an extra mediaItem in */

  try {
    for (let i = 0; i < pages; i++) {
      // Move media items from queue to to-be-sent queue
      const mediaToSend = queue.splice(0, ItemsPerPage + ((i < k) ? 1 : 0))
      
      // Send media group
      await replyWithMediaGroup(mediaToSend)
    }
  } catch (error) {
    reply(i18n.t('album_create_error')).catch(err => {
      console.error('Could not send album AND error message to user.')
    })
  }
}

// Start bot
bot.startPolling()