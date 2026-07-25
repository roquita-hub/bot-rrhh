const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const DB_FILE = './db.json';

// Nombre del rol de Discord con permisos de administración de RRHH
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

// Función para verificar si el usuario es Admin de Discord o tiene el rol de RRHH
function esAutorizado(member) {
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    if (member.roles.cache.some(role => role.name === ROL_ADMIN_NOMBRE)) return true;
    return false;
}

client.once('ready', () => {
    console.log(`✅ ¡Bot conectado exitosamente como ${client.user.tag}!`);
});

// --- COMANDOS POR TEXTO ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 1. Comando para enviar el Panel
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

    // 2. 👑 COMANDO ADMIN: Ver Ranking General (!verranking)
    if (message.content === '!verranking') {
        if (!esAutorizado(message.member)) {
            return message.reply('❌ No tienes permisos para usar este comando.');
        }

        const data = loadData();
        const entries = Object.entries(data.totalHours);

        if (entries.length === 0) {
            return message.reply('🏆 Aún no hay registros de horas acumuladas.');
        }

        entries.sort((a, b) => b[1] - a[1]);

        let rankingMsg = '📋 **RANKING GENERAL DE OFICIALES (Control RRHH)** 📋\n\n';
        entries.forEach(([uId, ms], index) => {
            const hrs = (ms / (1000 * 60 * 60)).toFixed(2);
            rankingMsg += `**#${index + 1}** <@${uId}> — **${hrs} hrs**\n`;
        });

        return message.channel.send(rankingMsg);
    }

    // 3. 👑 COMANDO ADMIN: Ver horas de un oficial específico (!verhoras @usuario)
    if (message.content.startsWith('!verhoras')) {
        if (!esAutorizado(message.member)) {
            return message.reply('❌ No tienes permisos para usar este comando.');
        }

        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply('⚠️ Debes mencionar a un usuario. Ejemplo: `!verhoras @Oficial`');
        }

        const data = loadData();
        const totalMs = data.totalHours[targetUser.id] || 0;
        const totalHrs = (totalMs / (1000 * 60 * 60)).toFixed(2);

        return message.channel.send(`📊 El oficial <@${targetUser.id}> tiene un total de **${totalHrs} horas** acumuladas.`);
    }

    // 4. 👑 COMANDO ADMIN: Sumar minutos a un usuario (!sumarhoras @usuario 60)
    if (message.content.startsWith('!sumarhoras')) {
        if (!esAutorizado(message.member)) {
            return message.reply('❌ No tienes permisos para usar este comando.');
        }

        const args = message.content.split(' ');
        const targetUser = message.mentions.users.first();
        const minutes = parseInt(args[2]);

        if (!targetUser || isNaN(minutes)) {
            return message.reply('⚠️ Uso correcto: `!sumarhoras @Usuario <minutos>`\nEjemplo: `!sumarhoras @Oficial 60` (para sumar 1 hora).');
        }

        const data = loadData();
        const msToAdd = minutes * 60 * 1000;
        
        if (!data.totalHours[targetUser.id]) data.totalHours[targetUser.id] = 0;
        data.totalHours[targetUser.id] += msToAdd;

        saveData(data);

        const totalHrs = (data.totalHours[targetUser.id] / (1000 * 60 * 60)).toFixed(2);
        return message.channel.send(`➕ Se le han **sumado ${minutes} minutos** a <@${targetUser.id}>. Total actual: **${totalHrs} hrs**.`);
    }

    // 5. 👑 COMANDO ADMIN: Restar minutos a un usuario (!restarhoras @usuario 30)
    if (message.content.startsWith('!restarhoras')) {
        if (!esAutorizado(message.member)) {
            return message.reply('❌ No tienes permisos para usar este comando.');
        }

        const args = message.content.split(' ');
        const targetUser = message.mentions.users.first();
        const minutes = parseInt(args[2]);

        if (!targetUser || isNaN(minutes)) {
            return message.reply('⚠️ Uso correcto: `!restarhoras @Usuario <minutos>`\nEjemplo: `!restarhoras @Oficial 30` (para descontar 30 minutos).');
        }

        const data = loadData();
        const msToSubtract = minutes * 60 * 1000;

        if (!data.totalHours[targetUser.id]) data.totalHours[targetUser.id] = 0;
        
        // Evitar que el total sea negativo
        data.totalHours[targetUser.id] = Math.max(0, data.totalHours[targetUser.id] - msToSubtract);

        saveData(data);

        const totalHrs = (data.totalHours[targetUser.id] / (1000 * 60 * 60)).toFixed(2);
        return message.channel.send(`➖ Se le han **restado ${minutes} minutos** a <@${targetUser.id}>. Total actual: **${totalHrs} hrs**.`);
    }

    // 6. 👑 COMANDO ADMIN: Resetear horas a 0 (!resetearhoras @usuario)
    if (message.content.startsWith('!resetearhoras')) {
        if (!esAutorizado(message.member)) {
            return message.reply('❌ No tienes permisos para usar este comando.');
        }

        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply('⚠️ Debes mencionar a un usuario. Ejemplo: `!resetearhoras @Oficial`');
        }

        const data = loadData();
        data.totalHours[targetUser.id] = 0;
        saveData(data);

        return message.channel.send(`🔄 Las horas del oficial <@${targetUser.id}> han sido reiniciadas a **0 horas**.`);
    }
});

// --- INTERACCIÓN CON BOTONES ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const data = loadData();
    const userId = interaction.user.id;
    const now = Date.now();

    // 🟢 ENTRADA
    if (interaction.customId === 'btn_entrada') {
        if (data.activeSessions[userId]) {
            return interaction.reply({ content: '⚠️ Ya tienes un turno activo registrado.', ephemeral: true });
        }
        data.activeSessions[userId] = now;
        saveData(data);
        return interaction.reply({ content: `✅ **ENTRADA REGISTRADA** - ¡Buen servicio, oficial <@${userId}>!`, ephemeral: true });
    }

    // 🔴 SALIDA
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

    // 📊 MIS HORAS
    if (interaction.customId === 'btn_horas') {
        const totalMs = data.totalHours[userId] || 0;
        const totalHrs = (totalMs / (1000 * 60 * 60)).toFixed(2);
        return interaction.reply({ content: `📊 <@${userId}>, tu tiempo acumulado es **${totalHrs} horas**.`, ephemeral: true });
    }

    // 🏆 RANKING (Botón público Top 5)
    if (interaction.customId === 'btn_ranking') {
        const entries = Object.entries(data.totalHours);
        if (entries.length === 0) return interaction.reply({ content: '🏆 Aún no hay registros.', ephemeral: true });

        entries.sort((a, b) => b[1] - a[1]);
        let rankingMsg = '🏆 **TOP 5 OFICIALES** 🏆\n\n';
        entries.slice(0, 5).forEach(([uId, ms], index) => {
            const hrs = (ms / (1000 * 60 * 60)).toFixed(2);
            rankingMsg += `**#${index + 1}** <@${uId}> — **${hrs} hrs**\n`;
        });
        return interaction.reply({ content: rankingMsg, ephemeral: true });
    }
});

client.login(process.env.TOKEN);
