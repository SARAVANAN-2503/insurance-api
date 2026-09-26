const messageService = require('../services/message-service');

async function scheduleMessage(req, res) {
  const schedule = await messageService.scheduleMessage(req.body);
  res.status(202).json({ message: 'Message scheduled', schedule });
}

async function listMessages(req, res) {
  const messages = await messageService.listMessages();
  res.status(200).json({ count: messages.length, messages });
}

module.exports = { scheduleMessage, listMessages };
