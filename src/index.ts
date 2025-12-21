import Fastify from 'fastify';
import { setupSockets } from './socket/setup.js';

const fastify = Fastify({
    logger: {
        transport: {
            target: 'pino-pretty' // Para que los logs sean legibles en la consola
        }
    }
});

const start = async () => {
    try {
        // Registrar Sockets
        await setupSockets(fastify);

        // Arrancar Servidor
        const port = Number(process.env.PORT) || 3000;
        await fastify.listen({ port, host: '0.0.0.0' });

        console.log(`🚀 Servidor Skip-Bo corriendo en http://localhost:${port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();