const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Guardar los tiempos de entrada de los usuarios temporalmente
const entradas = new Map();

client.once('ready', () => {
    console.log(`✅ ¡Bot conectado exitosamente como ${client.user.tag}!`);
});

// Comando para hacer aparecer el panel
client.on('messageCreate', async (message) => {
    if (message.content === '!panel') {
        const embedPanel = new EmbedBuilder()
            .setTitle('👮 Panel de RRHH')
            .setDescription('Selecciona una opción.\n\n**Policía Nacional | Poco Floro RP**')
            .setColor(0x0080FF);

        const btnEntrar = new ButtonBuilder()
            .setCustomId('btn_entrar')
            .setLabel('ENTRAR')
            .setStyle(ButtonStyle.Success);

        const btnSalir = new ButtonBuilder()
            .setCustomId('btn_salir')
            .setLabel('SALIR')
            .setStyle(ButtonStyle.Danger);

        const btnHoras = new ButtonBuilder()
            .setCustomId('btn_horas')
            .setLabel('MIS HORAS')
            .setStyle(ButtonStyle.Primary);

        const btnRanking = new ButtonBuilder()
            .setCustomId('btn_ranking')
            .setLabel('RANKING')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(btnEntrar, btnSalir, btnHoras, btnRanking);

        await message.channel.send({ embeds: [embedPanel], components: [row] });
    }
});

// Respuesta a los clics en los botones
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId, user } = interaction;

    if (customId === 'btn_entrar') {
        entradas.set(user.id, Date.now());
        await interaction.reply({ content: `✅ **ENTRADA REGISTRADA** - ¡Buen servicio, oficial <@${user.id}>!`, flags: 64 });
    } 
    else if (customId === 'btn_salir') {
        if (!entradas.has(user.id)) {
            return await interaction.reply({ content: `⚠️ <@${user.id}>, no tenías una entrada registrada previamente.`, flags: 64 });
        }
        const tiempoEntrada = entradas.get(user.id);
        const minutos = Math.floor((Date.now() - tiempoEntrada) / 1000 / 60);
        entradas.delete(user.id);

        await interaction.reply({ content: `🔴 **SALIDA REGISTRADA** - Estuviste en servicio **${minutos} minutos**.`, flags: 64 });
    } 
    else if (customId === 'btn_horas') {
        await interaction.reply({ content: `📊 <@${user.id}>, esta función de acumular horas totales la conectaremos con base de datos en el siguiente paso.`, flags: 64 });
    } 
    else if (customId === 'btn_ranking') {
        await interaction.reply({ content: `🏆 **Ranking de Oficiales:** Proximamente disponible.`, flags: 64 });
    }
});

// REEMPLAZA EL TEXTO DE ABAJO CON TU TOKEN DE VERDAD
client.login('MTUzMDM2NTkzOTI2OTUwMTAzOQ.GZpfL_.VyD-YS8xScmiKfR4cohPN13H8MDEG7JPkRm__0');