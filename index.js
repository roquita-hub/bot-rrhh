const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
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

// Función para verificar si es Admin o tiene rol RRHH
function isStaff(member) {
    return member.permissions.has('Administrator') || member.roles.cache.some(r => r.name.toLowerCase() === 'rrhh');
}

client.once('ready', () => {
    console.log(`✅ ¡Bot conectado exitosamente como ${client.user.tag}!`);
});

// Comandos por Texto
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Comando Panel
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

        await message.channel.send({ embeds: [embed], components: [row] });
    }

    // 🔴 COMANDO: FORZAR SALIDA (!forzarsalida @usuario [guardar/descartar])
    if (message.content.startsWith('!forzarsalida') || message.content.startsWith('!fs')) {
        if (!isStaff(message.member)) {
            return message.reply('❌ No tienes permisos para usar este comando (requiere Administrador o rol `RRHH`).');
        }

        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply('⚠️ Debes mencionar al oficial. Ejemplo: `!forzarsalida @Oficial`');
        }

        const data = loadData();
        const userId = targetUser.id;

        if (!data.activeSessions[userId]) {
            return message.reply(`⚠️ El oficial <@${userId}> **no tiene un turno activo** en este momento.`);
        }

        const args = message.content.split(' ');
        const mode = args[2] ? args[2].toLowerCase() : 'guardar'; // Por defecto guarda

        const startTime = data.activeSessions[userId];
        const now = Date.now();
        const elapsedMs = now - startTime;
        delete data.activeSessions[userId];

        if (mode === 'descartar') {
            saveData(data);
            return message.reply(`🛑 **TURNO CANCELADO** - Se forzó la salida de <@${userId}> **sin acumular horas**.`);
        } else {
            if (!data.totalHours[userId]) data.totalHours[userId] = 0;
            data.totalHours[userId] += elapsedMs;
            saveData(data);

            const minutesWorked = Math.floor(elapsedMs / (1000 * 60));
            const hoursWorked = (elapsedMs / (1000 * 60 * 60)).toFixed(2);

            return message.reply(`🔴 **SALIDA FORZADA** - Se cerró el turno de <@${userId}>. Se le sumaron **${minutesWorked} min** (${hoursWorked} hrs).`);
        }
    }
});

// Botones del Panel
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const data = loadData();
    const userId = interaction.user.id;
    const now = Date.now();

    if (interaction.customId === 'btn_entrada') {
        if (data.activeSessions[userId]) {
            return interaction.reply({ content: '⚠️ Ya tienes un turno activo registrado.', ephemeral: true });
        }
        data.activeSessions[userId] = now;
        saveData(data);
        return interaction.reply({ content: `✅ **ENTRADA REGISTRADA** - ¡Buen servicio, oficial <@${userId}>!`, ephemeral: true });
    }

    if (interaction.customId === 'btn_salida') {
        if (!data.activeSessions[userId]) {
            return interaction.reply({ content: '⚠️ No tienes un turno activo.', ephemeral: true });
        }
        const startTime = data.activeSessions[userId];
        const elapsedMs = now - startTime;
        delete data.activeSessions[userId];

        if (!data.totalHours[userId]) data.totalHours[userId] = 0;
        data.totalHours[userId] += elapsedMs;
        saveData(data);

        const minutesWorked = Math.floor(elapsedMs / (1000 * 60));
        return interaction.reply({ content: `🔴 **SALIDA REGISTRADA** - Estuviste en servicio **${minutesWorked} minutos**.`, ephemeral: true });
    }

    if (interaction.customId === 'btn_horas') {
        const totalMs = data.totalHours[userId] || 0;
        let activeText = '';
        if (data.activeSessions[userId]) {
            const currentMins = Math.floor((now - data.activeSessions[userId]) / (1000 * 60));
            activeText = `\n⏱️ *Turno en progreso:* **${currentMins} min**`;
        }
        const totalHrs = (totalMs / (1000 * 60 * 60)).toFixed(2);
        return interaction.reply({ content: `📊 <@${userId}>, tu tiempo acumulado es **${totalHrs} horas**.${activeText}`, ephemeral: true });
    }

    if (interaction.customId === 'btn_ranking') {
        const entries = Object.entries(data.totalHours);
        if (entries.length === 0) return interaction.reply({ content: '🏆 Sin registros aún.', ephemeral: true });

        entries.sort((a, b) => b[1] - a[1]);
        let msg = '🏆 **RANKING DE OFICIALES** 🏆\n\n';
        entries.slice(0, 10).forEach(([uId, ms], i) => {
            msg += `**#${i + 1}** <@${uId}> — **${(ms / (1000 * 60 * 60)).toFixed(2)} hrs**\n`;
        });
        return interaction.reply({ content: msg, ephemeral: true });
    }
});

client.login(process.env.TOKEN);
