const app = require('express')();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: '*',
  },
});
const mongoClient = require('mongodb').MongoClient;
const dburi = 'mongodb://root:chatappdb@db:27017';
const connectOption = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
};

const get = async () => {
  const client = await mongoClient.connect(dburi, connectOption);
  const db = await client.db('easychat');
  const collection = await db.collection('chatdata');
  const docs = await collection.find({}).toArray();
  return docs;
};

const set = async (d) => {
  const client = await mongoClient.connect(dburi, connectOption);
  const db = await client.db('easychat');
  const collection = await db.collection('chatdata');
  await collection.insertOne(d);
  return;
};

io.on('connection', (socket) => {
  console.log('connected');
  get().then((docs) => {
    io.to(socket.id).emit('init', docs);
  });
  socket.on('submit', (d) => {
    set(d);
    socket.broadcast.emit('update', d);
  });
});

server.listen(8080, () => console.log('server is working at localhost:8080'));
