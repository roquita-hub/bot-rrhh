const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const http = require('http');

// --- 🌐 TRUCO PARA MANTENER RENDER ENCENDIDO 24/7 ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('Bot de Discord Policia Nacional Activo 24/7');
    res.end();
}).listen(PORT, () => {
    console.log(`🌍 Servidor Web de soporte escuchando en el puerto ${PORT}`);
});

// --- CONFIGURACIÓN DEL BOT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const DB_FILE = './db.json';
const ROL_ADMIN_NOMBRE = "RRHH"; 

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

function esAutorizado(member) {
    if (!member) return false;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    if (member.roles.cache.some(role => role.name === ROL_ADMIN_NOMBRE)) return true;
    return false;
}

client.once('ready', () => {
    console.log(`✅ ¡Bot conectado exitosamente como ${client.user.tag}!`);
});

// --- COMANDOS Y EVENTOS DE DISCORD ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 1. !panel
    if (message.content === '!panel') {
        const embed = new EmbedBuilder()
            .setTitle('🛡️ Control de Asistencia y Horas')
            .setDescription('Presiona los botones para registrar tu entrada, salida o consultar tu tiempo en servicio.')
            .setColor('#0055ff');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_entrada').setLabel('Entrada').setStyle(ButtonStyle.Success).setEmoji('🟢'),
            new ButtonBuilder().setCustomId('btn_salida').setLabel('Salida').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
            new ButtonBuilder().setCustomId('btn_horas').setLabel('Mis Horas').setStyle(ButtonStyle.Primary).setEmoji('📊'),
            new ButtonBuilder().setCustomId('btn_ranking').setLabel('Ranking').setStyle(ButtonStyle.Secondary).setEmoji('🏆')
        );

        return message.channel.send({ embeds: [embed], components: [row] });
    }

    // 2. !verranking
    if (message.content === '!verranking') {
        if (!esAutorizado(message.member)) return message.reply('❌ No tienes permisos.');

        const data = loadData();
        const entries = Object.entries(data.totalHours);
        if (entries.length === 0) return message.reply('🏆 Aún no hay registros.');

        entries.sort((a, b) => b[1] - a[1]);

        let rankingMsg = '📋 **RANKING GENERAL DE OFICIALES** 📋\n\n';
        entries.forEach(([uId, ms], index) => {
            const hrs = (ms / (1000 * 60 * 60)).toFixed(2);
            rankingMsg += `**#${index + 1}** <@${uId}> — **${hrs} hrs**\n`;
        });

        return message.channel.send(rankingMsg);
    }

    // 3. !verhoras @usuario
    if (message.content.startsWith('!verhoras')) {
        if (!esAutorizado(message.member)) return message.reply('❌ No tienes permisos.');

        const targetUser = message.mentions.users.first();
        if (!targetUser) return message.reply('⚠️ Usa: `!verhoras @Oficial`');

        const data = loadData();
        const totalMs = data.totalHours[targetUser.id] || 0;
        const totalHrs = (totalMs / (1000 * 60 * 60)).toFixed(2);

        return message.channel.send(`📊 <@${targetUser.id}> tiene **${totalHrs} horas** acumuladas.`);
    }

    // 4. !sumarhoras @usuario minutos
    if (message.content.startsWith('!sumarhoras')) {
        if (!esAutorizado(message.member)) return message.reply('❌ No tienes permisos.');

        const args = message.content.trim().split(/\s+/);
        const targetUser = message.mentions.users.first();
        const minutes = parseInt(args[2]);

        if (!targetUser || isNaN(minutes)) {
            return message.reply('⚠️ Ejemplo de uso: `!sumarhoras @Oficial 60`');
        }

        const data = loadData();
        const msToAdd = minutes * 60 * 1000;

        if (!data.totalHours[targetUser.id]) data.totalHours[targetUser.id] = 0;
        data.totalHours[targetUser.id] += msToAdd;
        saveData(data);

        const totalHrs = (data.totalHours[targetUser.id] / (1000 * 60 * 60)).toFixed(2);
        return message.channel.send(`➕ Se sumaron **${minutes} min** a <@${targetUser.id}>. Total: **${totalHrs} hrs**.`);
    }

    // 5. !restarhoras @usuario minutos
    if (message.content.startsWith('!restarhoras')) {
        if (!esAutorizado(message.member)) return message.reply('❌ No tienes permisos.');

        const args = message.content.trim().split(/\s+/);
        const targetUser = message.mentions.users.first();
        const minutes = parseInt(args[2]);

        if (!targetUser || isNaN(minutes)) {
            return message.reply('⚠️ Ejemplo de uso: `!restarhoras @Oficial 30`');
        }

        const data = loadData();
        const msToSub = minutes * 60 * 1000;

        if (!data.totalHours[targetUser.id]) data.totalHours[targetUser.id] = 0;
        data.totalHours[targetUser.id] = Math.max(0, data.totalHours[targetUser.id] - msToSub);
        saveData(data);

        const totalHrs = (data.totalHours[targetUser.id] / (1000 * 60 * 60)).toFixed(2);
        return message.channel.send(`➖ Se restaron **${minutes} min** a <@${targetUser.id}>. Total: **${totalHrs} hrs**.`);
    }

    // 6. !resetearhoras @usuario
    if (message.content.startsWith('!resetearhoras')) {
        if (!esAutorizado(message.member)) return message.reply('❌ No tienes permisos.');

        const targetUser = message.mentions.users.first();
        if (!targetUser) return message.reply('⚠️ Usa: `!resetearhoras @Oficial`');

        const data = loadData();
        data.totalHours[targetUser.id] = 0;
        saveData(data);

        return message.channel.send(`🔄 Las horas de <@${targetUser.id}> se reiniciaron a **0 hrs**.`);
    }
});

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
        return interaction.reply({ content: `✅ **ENTRADA REGISTRADA** - <@${userId}>`, flags: 64 });
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
        return interaction.reply({ content: `🔴 **SALIDA REGISTRADA** - Estuviste **${minutesWorked} min**.`, flags: 64 });
    }

    if (interaction.customId === 'btn_horas') {
        const totalMs = data.totalHours[userId] || 0;
        const totalHrs = (totalMs / (1000 * 60 * 60)).toFixed(2);
        return interaction.reply({ content: `📊 Tu acumulado es **${totalHrs} horas**.`, flags: 64 });
    }

    if (interaction.customId === 'btn_ranking') {
        const entries = Object.entries(data.totalHours);
        if (entries.length === 0) return interaction.reply({ content: '🏆 Aún no hay registros.', flags: 64 });

        entries.sort((a, b) => b[1] - a[1]);
        let rankingMsg = '🏆 **TOP 5 OFICIALES** 🏆\n\n';
        entries.slice(0, 5).forEach(([uId, ms], index) => {
            const hrs = (ms / (1000 * 60 * 60)).toFixed(2);
            rankingMsg += `**#${index + 1}** <@${uId}> — **${hrs} hrs**\n`;
        });
        return interaction.reply({ content: rankingMsg, flags: 64 });
    }
});

client.login(process.env.TOKEN);
