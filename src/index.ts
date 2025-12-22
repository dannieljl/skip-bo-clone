import Fastify from 'fastify';
import cors from '@fastify/cors';
import { setupSockets } from './socket/setup.js';
import dotenv from 'dotenv';

dotenv.config();

const fastify = Fastify({
    logger: process.env.NODE_ENV !== 'production'
        ? {
            transport: {
                target: 'pino-pretty'
            }
        }
        : true
});

const start = async () => {
    try {
        // ✅ CORS (DEBE ir antes de sockets)
        await fastify.register(cors, {
            origin: (origin, cb) => {
                const allowedOrigins = [
                    'http://localhost:4200', // Angular dev
                    'http://127.0.0.1:4200',
                    process.env.FRONTEND_URL // Producción (AWS)
                ];

                // Permitir requests sin origin (Postman, curl, health checks)
                if (!origin) {
                    cb(null, true);
                    return;
                }

                if (allowedOrigins.includes(origin)) {
                    cb(null, true);
                } else {
                    cb(new Error('Not allowed by CORS'), false);
                }
            },
            credentials: true
        });

        // 🔌 Registrar Sockets
        await setupSockets(fastify);

        const port = Number(process.env.PORT) || 3000;
        const host = process.env.HOST || '0.0.0.0';

        await fastify.listen({ port, host });

        console.log(
            `🚀 Servidor Skip-Bo v1.0.0 run in ${
                host === '0.0.0.0' ? 'http://localhost' : host
            }:${port}`
        );
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
