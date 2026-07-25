const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const http = require('http');

// --- 🌐 SERVIDOR WEB PARA QUE RENDER NO APAGUE EL BOT ---
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('Bot Policia Nacional Activo 24/7');
    res.end();
}).listen(PORT, () => {
    console.log(`🌐 Servidor Web de soporte escuchando en el puerto ${PORT}`);
});

// --- CONFIGURACIÓN DEL BOT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

const DB_FILE = './db.json';

function loadData() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ activeSessions: {}, totalHours: {} }));
    }
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        return { activeSessions: {}, totalHours: {} };
    }
}

function saveData(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Función para verificar si es Admin de Discord o tiene rol RRHH
function isStaff(member) {
    return member.permissions.has('Administrator') || member.roles.cache.some(r => r.name.toLowerCase() === 'rrhh');
}

client.once('ready', () => {
    console.log(`✅ ¡Bot conectado exitosamente como ${client.user.tag}!`);
});

// --- COMANDOS POR TEXTO ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 1. Comando Panel
    if (message.content === '!panel') {
        const embed = new EmbedBuilder()
            .setTitle('🛡️ Control de Asistencia y Horas')
            .setDescription('Presiona los botones para registrar tu entrada, salida o consultar tu tiempo en servicio.')
            .setColor('#0055ff');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_entrada').setLabel('ENTRAR').setStyle(ButtonStyle.Success).setEmoji('🟢'),
            new ButtonBuilder().setCustomId('btn_salida').setLabel('SALIR').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
            new ButtonBuilder().setCustomId('btn_horas').setLabel('MIS HORAS').setStyle(ButtonStyle.Primary).setEmoji('📊'),
            new ButtonBuilder().setCustomId('btn_ranking').setLabel('RANKING').setStyle(ButtonStyle.Secondary).setEmoji('🏆')
        );

        return message.channel.send({ embeds: [embed], components: [row] });
    }

    // 2. 👑 Ranking completo para Admins/RRHH (!verranking)
    if (message.content === '!verranking') {
        if (!isStaff(message.member)) return message.reply('❌ No tienes permisos.');
        const data = loadData();
        const entries = Object.entries(data.totalHours);
        if (entries.length === 0) return message.reply('🏆 Aún no hay registros.');

        entries.sort((a, b) => b[1] - a[1]);
        let msg = '📋 **RANKING GENERAL DE OFICIALES** 📋\n\n';
        entries.forEach(([uId, ms], i) => {
            msg += `**#${i + 1}** <@${uId}> — **${(ms / (1000 * 60 * 60)).toFixed(2)} hrs**\n`;
        });
        return message.channel.send(msg);
    }

    // 3. 👑 Sumar horas (!sumarhoras @usuario 60)
    if (message.content.startsWith('!sumarhoras')) {
        if (!isStaff(message.member)) return message.reply('❌ No tienes permisos.');
        const args = message.content.split(' ');
        const targetUser = message.mentions.users.first();
        const minutes = parseInt(args[2]);

        if (!targetUser || isNaN(minutes)) return message.reply('⚠️ Uso: `!sumarhoras @Usuario <minutos>`');

        const data = loadData();
        if (!data.totalHours[targetUser.id]) data.totalHours[targetUser.id] = 0;
        data.totalHours[targetUser.id] += minutes * 60 * 1000;
        saveData(data);

        return message.channel.send(`➕ Se le sumaron **${minutes} minutos** a <@${targetUser.id}>.`);
    }

    // 4. 👑 Restar horas (!restarhoras @usuario 30)
    if (message.content.startsWith('!restarhoras')) {
        if (!isStaff(message.member)) return message.reply('❌ No tienes permisos.');
        const args = message.content.split(' ');
        const targetUser = message.mentions.users.first();
        const minutes = parseInt(args[2]);

        if (!targetUser || isNaN(minutes)) return message.reply('⚠️ Uso: `!restarhoras @Usuario <minutos>`');

        const data = loadData();
        if (!data.totalHours[targetUser.id]) data.totalHours[targetUser.id] = 0;
        data.totalHours[targetUser.id] = Math.max(0, data.totalHours[targetUser.id] - (minutes * 60 * 1000));
        saveData(data);

        return message.channel.send(`➖ Se le restaron **${minutes} minutos** a <@${targetUser.id}>.`);
    }

    // 5. 👑 Resetear a 0 (!resetearhoras @usuario)
    if (message.content.startsWith('!resetearhoras')) {
        if (!isStaff(message.member)) return message.reply('❌ No tienes permisos.');
        const targetUser = message.mentions.users.first();
        if (!targetUser) return message.reply('⚠️ Uso: `!resetearhoras @Usuario`');

        const data = loadData();
        data.totalHours[targetUser.id] = 0;
        saveData(data);

        return message.channel.send(`🔄 Horas de <@${targetUser.id}> reiniciadas a **0**.`);
    }

    // 6. 👑 Forzar salida (!forzarsalida @usuario [descartar])
    if (message.content.startsWith('!forzarsalida') || message.content.startsWith('!fs')) {
        if (!isStaff(message.member)) return message.reply('❌ No tienes permisos.');
        const targetUser = message.mentions.users.first();
        if (!targetUser) return message.reply('⚠️ Debes mencionar al oficial. Ejemplo: `!forzarsalida @Oficial`');

        const data = loadData();
        const userId = targetUser.id;

        if (!data.activeSessions[userId]) return message.reply(`⚠️ <@${userId}> **no tiene un turno activo**.`);

        const args = message.content.split(' ');
        const mode = args[2] ? args[2].toLowerCase() : 'guardar';

        const startTime = data.activeSessions[userId];
        const elapsedMs = Date.now() - startTime;
        delete data.activeSessions[userId];

        if (mode === 'descartar') {
            saveData(data);
            return message.reply(`🛑 Turno de <@${userId}> cancelado **sin guardar horas**.`);
        } else {
            if (!data.totalHours[userId]) data.totalHours[userId] = 0;
            data.totalHours[userId] += elapsedMs;
            saveData(data);

            const minutesWorked = Math.floor(elapsedMs / (1000 * 60));
            return message.reply(`🔴 Salida forzada para <@${userId}>. Se sumaron **${minutesWorked} min**.`);
        }
    }
});

// --- BOTONES DEL PANEL ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const data = loadData();
    const userId = interaction.user.id;
    const now = Date.now();

    if (interaction.customId === 'btn_entrada') {
        if (data.activeSessions[userId]) {
            return interaction.reply({ content: '⚠️ Ya tienes un turno activo.', flags: 64 });
        }
        data.activeSessions[userId] = now;
        saveData(data);
        return interaction.reply({ content: `✅ **ENTRADA REGISTRADA** - ¡Buen servicio <@${userId}>!`, flags: 64 });
    }

    if (interaction.customId === 'btn_salida') {
        if (!data.activeSessions[userId]) {
            return interaction.reply({ content: '⚠️ No tienes un turno activo.', flags: 64 });
        }
        const startTime = data.activeSessions[userId];
        const elapsedMs = now - startTime;
        delete data.activeSessions[userId];

        if (!data.totalHours[userId]) data.totalHours[userId] = 0;
        data.totalHours[userId] += elapsedMs;
        saveData(data);

        const minutesWorked = Math.floor(elapsedMs / (1000 * 60));
        return interaction.reply({ content: `🔴 **SALIDA REGISTRADA** - Estuviste en servicio **${minutesWorked} minutos**.`, flags: 64 });
    }

    if (interaction.customId === 'btn_horas') {
        const totalMs = data.totalHours[userId] || 0;
        let activeText = '';
        if (data.activeSessions[userId]) {
            const currentMins = Math.floor((now - data.activeSessions[userId]) / (1000 * 60));
            activeText = `\n⏱️ *Turno en progreso:* **${currentMins} min**`;
        }
        const totalHrs = (totalMs / (1000 * 60 * 60)).toFixed(2);
        return interaction.reply({ content: `📊 <@${userId}>, tu tiempo acumulado es **${totalHrs} horas**.${activeText}`, flags: 64 });
    }

    if (interaction.customId === 'btn_ranking') {
        const entries = Object.entries(data.totalHours);
        if (entries.length === 0) return interaction.reply({ content: '🏆 Sin registros aún.', flags: 64 });

        entries.sort((a, b) => b[1] - a[1]);
        let msg = '🏆 **TOP 5 OFICIALES** 🏆\n\n';
        entries.slice(0, 5).forEach(([uId, ms], i) => {
            msg += `**#${i + 1}** <@${uId}> — **${(ms / (1000 * 60 * 60)).toFixed(2)} hrs**\n`;
        });
        return interaction.reply({ content: msg, flags: 64 });
    }
});

client.login(process.env.TOKEN);
