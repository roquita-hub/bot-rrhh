const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
    ]
});

// Archivo para guardar la base de datos de horas y turnos activos
const DB_FILE = './db.json';

// Cargar o inicializar datos
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

client.once('ready', () => {
    console.log(`✅ ¡Bot conectado exitosamente como ${client.user.tag}!`);
});

// Comando para enviar el panel con los botones
client.on('messageCreate', async (message) => {
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

        await message.channel.send({ embeds: [embed], components: [row] });
    }
});

// Manejo de interacciones de botones
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

        return interaction.reply({
            content: `✅ **ENTRADA REGISTRADA** - ¡Buen servicio, oficial <@${userId}>!`,
            ephemeral: true
        });
    }

    // 🔴 SALIDA
    if (interaction.customId === 'btn_salida') {
        if (!data.activeSessions[userId]) {
            return interaction.reply({ content: '⚠️ No tienes un turno activo. Registra tu entrada primero.', ephemeral: true });
        }

        const startTime = data.activeSessions[userId];
        const elapsedMs = now - startTime;
        delete data.activeSessions[userId];

        // Sumar al total del usuario
        if (!data.totalHours[userId]) data.totalHours[userId] = 0;
        data.totalHours[userId] += elapsedMs;

        saveData(data);

        const minutesWorked = Math.floor(elapsedMs / (1000 * 60));
        const hoursWorked = (elapsedMs / (1000 * 60 * 60)).toFixed(2);

        return interaction.reply({
            content: `🔴 **SALIDA REGISTRADA** - Estuviste en servicio **${minutesWorked} minutos** (${hoursWorked} hrs).`,
            ephemeral: true
        });
    }

    // 📊 MIS HORAS
    if (interaction.customId === 'btn_horas') {
        const totalMs = data.totalHours[userId] || 0;
        let activeTimeText = '';

        if (data.activeSessions[userId]) {
            const currentSessionMs = now - data.activeSessions[userId];
            const currentMins = Math.floor(currentSessionMs / (1000 * 60));
            activeTimeText = `\n⏱️ *Turno actual en progreso:* **${currentMins} minutos**`;
        }

        const totalMins = Math.floor(totalMs / (1000 * 60));
        const totalHrs = (totalMs / (1000 * 60 * 60)).toFixed(2);

        return interaction.reply({
            content: `📊 <@${userId}>, tu tiempo total acumulado es:\n👉 **${totalMins} minutos** (~${totalHrs} horas).${activeTimeText}`,
            ephemeral: true
        });
    }

    // 🏆 RANKING
    if (interaction.customId === 'btn_ranking') {
        const entries = Object.entries(data.totalHours);

        if (entries.length === 0) {
            return interaction.reply({ content: '🏆 Aún no hay registros de horas acumuladas.', ephemeral: true });
        }

        entries.sort((a, b) => b[1] - a[1]); // Ordenar de mayor a menor

        let rankingMsg = '🏆 **RANKING DE OFICIALES (Horas Totales)** 🏆\n\n';
        entries.slice(0, 10).forEach(([uId, ms], index) => {
            const hrs = (ms / (1000 * 60 * 60)).toFixed(2);
            rankingMsg += `**#${index + 1}** <@${uId}> — **${hrs} hrs**\n`;
        });

        return interaction.reply({ content: rankingMsg, ephemeral: true });
    }
});

client.login(process.env.TOKEN);
