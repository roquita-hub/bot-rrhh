const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  PermissionFlagsBits 
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// --- SERVIDOR WEB PARA RENDER / UPTIMEROBOT ---
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('🤖 Bot PNP RRHH está activo 24/7.');
});

app.listen(PORT, () => {
  console.log(`🌐 Servidor Web de soporte escuchando en el puerto ${PORT}`);
});

// --- INICIALIZACIÓN DEL BOT DISCORD ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const DATA_FILE = path.join(__dirname, 'data.json');

// Cargar o inicializar la estructura de datos por Servidor (Guild ID)
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error al leer data.json, inicializando vacío:', err);
    return {};
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error al guardar data.json:', err);
  }
}

// Asegurar estructura para un servidor específico
function ensureGuildData(data, guildId) {
  if (!data[guildId]) {
    data[guildId] = {
      activeSessions: {}, // userId -> timestamp de entrada
      totalTimeMs: {},    // userId -> milisegundos acumulados
      userNames: {}       // userId -> displayName
    };
  }
  if (!data[guildId].activeSessions) data[guildId].activeSessions = {};
  if (!data[guildId].totalTimeMs) data[guildId].totalTimeMs = {};
  if (!data[guildId].userNames) data[guildId].userNames = {};
}

// Utilidad para formatear milisegundos a hh:mm:ss
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

// Verificar si el usuario tiene permiso RRHH / Admin
function isRRHH(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return member.roles.cache.some(role => role.name.toLowerCase() === 'rrhh');
}

// --- EVENTO READY ---
client.once('ready', () => {
  console.log(`✅ ¡Bot conectado exitosamente como ${client.user.tag}!`);
});

// --- COMANDOS POR MENSAJE ---
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim();
  const guildId = message.guild.id;
  const db = loadData();
  ensureGuildData(db, guildId);

  // 1. Comando !panel
  if (content === '!panel') {
    if (!isRRHH(message.member)) {
      return message.reply('❌ Solo personal autorizado de **RRHH** o Administradores pueden desplegar el panel.');
    }

    const embed = new EmbedBuilder()
      .setTitle('POLICÍA NACIONAL DEL PERÚ - CONTROL DE ASISTENCIA')
      .setDescription(
        'Bienvenido al sistema de registro de turno de servicio.\n\n' +
        '🟢 **Marcar Entrada:** Inicia tu turno de servicio.\n' +
        '🔴 **Marcar Salida:** Finaliza tu turno y registra tus horas trabajadas.\n' +
        '📊 **Ver Mis Horas:** Consulta tu tiempo total acumulado en este servidor.'
      )
      .setColor('#008000')
      .setThumbnail('https://i.imgur.com/8Q9Z8gO.png')
      .setFooter({ text: 'Dirección de Recursos Humanos - PNP' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_entrada')
        .setLabel('Marcar Entrada')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🟢'),
      new ButtonBuilder()
        .setCustomId('btn_salida')
        .setLabel('Marcar Salida')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔴'),
      new ButtonBuilder()
        .setCustomId('btn_mishoras')
        .setLabel('Ver Mis Horas')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📊')
    );

    await message.channel.send({ embeds: [embed], components: [row] });
    return message.delete().catch(() => {});
  }

  // 2. Comando !verranking
  if (content === '!verranking') {
    const guildData = db[guildId];
    const userIds = Object.keys(guildData.totalTimeMs);

    if (userIds.length === 0) {
      return message.reply('ℹ️ Aún no hay registros de horas en este servidor.');
    }

    const sorted = userIds
      .map(id => ({
        id,
        name: guildData.userNames[id] || `<@${id}>`,
        time: guildData.totalTimeMs[id] || 0
      }))
      .sort((a, b) => b.time - a.time);

    let rankingText = '';
    sorted.slice(0, 15).forEach((item, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      rankingText += `${medal} **${item.name}** — ${formatDuration(item.time)}\n`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`🏆 RANKING DE HORAS - ${message.guild.name}`)
      .setDescription(rankingText)
      .setColor('#FFD700')
      .setTimestamp();

    return message.channel.send({ embeds: [embed] });
  }

  // 3. Comando !sumarhoras @usuario <horas>
  if (content.startsWith('!sumarhoras')) {
    if (!isRRHH(message.member)) {
      return message.reply('❌ No tienes permisos de RRHH.');
    }

    const args = content.split(' ');
    const target = message.mentions.members.first();
    const hoursToAdd = parseFloat(args[2]);

    if (!target || isNaN(hoursToAdd) || hoursToAdd <= 0) {
      return message.reply('⚠️ Uso correcto: `!sumarhoras @usuario 2` (para sumar 2 horas).');
    }

    const msToAdd = hoursToAdd * 3600 * 1000;
    db[guildId].totalTimeMs[target.id] = (db[guildId].totalTimeMs[target.id] || 0) + msToAdd;
    db[guildId].userNames[target.id] = target.displayName;
    saveData(db);

    return message.reply(`✅ Se agregaron **${hoursToAdd} horas** correctamente a **${target.displayName}** en este servidor.`);
  }

  // 4. Comando !restarhoras @usuario <horas>
  if (content.startsWith('!restarhoras')) {
    if (!isRRHH(message.member)) {
      return message.reply('❌ No tienes permisos de RRHH.');
    }

    const args = content.split(' ');
    const target = message.mentions.members.first();
    const hoursToSub = parseFloat(args[2]);

    if (!target || isNaN(hoursToSub) || hoursToSub <= 0) {
      return message.reply('⚠️ Uso correcto: `!restarhoras @usuario 1` (para restar 1 hora).');
    }

    const msToSub = hoursToSub * 3600 * 1000;
    const current = db[guildId].totalTimeMs[target.id] || 0;
    db[guildId].totalTimeMs[target.id] = Math.max(0, current - msToSub);
    saveData(db);

    return message.reply(`✅ Se restaron **${hoursToSub} horas** a **${target.displayName}** en este servidor.`);
  }

  // 5. Comando !forzarsalida @usuario
  if (content.startsWith('!forzarsalida')) {
    if (!isRRHH(message.member)) {
      return message.reply('❌ No tienes permisos de RRHH.');
    }

    const target = message.mentions.members.first();
    if (!target) {
      return message.reply('⚠️ Uso correcto: `!forzarsalida @usuario`.');
    }

    if (!db[guildId].activeSessions[target.id]) {
      return message.reply(`ℹ️ El usuario **${target.displayName}** no tenía un turno activo en este servidor.`);
    }

    delete db[guildId].activeSessions[target.id];
    saveData(db);

    return message.reply(`🛑 Se forzó la salida del servicio para **${target.displayName}** en este servidor sin guardar horas incompletas.`);
  }
});

// --- INTERACCIÓN DE BOTONES ---
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton() || !interaction.guild) return;

  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const displayName = interaction.member ? interaction.member.displayName : interaction.user.username;

  const db = loadData();
  ensureGuildData(db, guildId);

  const guildData = db[guildId];
  guildData.userNames[userId] = displayName;

  if (interaction.customId === 'btn_entrada') {
    if (guildData.activeSessions[userId]) {
      const startTime = guildData.activeSessions[userId];
      const elapsed = Date.now() - startTime;
      return interaction.reply({
        content: `⚠️ Ya tienes un turno activo iniciado hace **${formatDuration(elapsed)}**. Debes marcar salida antes de iniciar otro.`,
        ephemeral: true
      });
    }

    guildData.activeSessions[userId] = Date.now();
    saveData(db);

    return interaction.reply({
      content: `🟢 **Entrada registrada:** ¡Buen servicio, oficial **${displayName}**! Hora de inicio: <t:${Math.floor(Date.now() / 1000)}:T>.`,
      ephemeral: true
    });
  }

  if (interaction.customId === 'btn_salida') {
    if (!guildData.activeSessions[userId]) {
      return interaction.reply({
        content: `⚠️ No tienes un turno activo registrado en este servidor. Marca entrada primero.`,
        ephemeral: true
      });
    }

    const startTime = guildData.activeSessions[userId];
    const sessionMs = Date.now() - startTime;

    delete guildData.activeSessions[userId];
    guildData.totalTimeMs[userId] = (guildData.totalTimeMs[userId] || 0) + sessionMs;
    saveData(db);

    return interaction.reply({
      content: `🔴 **Salida registrada:** Servicio finalizado.\n⏱️ **Tiempo servido hoy:** ${formatDuration(sessionMs)}\n📈 **Total acumulado en este servidor:** ${formatDuration(guildData.totalTimeMs[userId])}`,
      ephemeral: true
    });
  }

  if (interaction.customId === 'btn_mishoras') {
    const totalMs = guildData.totalTimeMs[userId] || 0;
    const isWorking = guildData.activeSessions[userId];

    let msg = `📊 **Tus Horas Totales en ${interaction.guild.name}:** ${formatDuration(totalMs)}`;
    if (isWorking) {
      const currentMs = Date.now() - isWorking;
      msg += `\n🟢 *Actualmente en servicio:* lleva **${formatDuration(currentMs)}** de turno activo.`;
    }

    return interaction.reply({
      content: msg,
      ephemeral: true
    });
  }
});

// LOGIN EN DISCORD
client.login(process.env.DISCORD_TOKEN);
