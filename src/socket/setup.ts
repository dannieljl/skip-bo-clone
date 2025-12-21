import { FastifyInstance } from 'fastify';
import socketioServer from 'fastify-socket.io'; // Cambiamos el nombre del import
import { handleSocketEvents } from './handlers.js'; // Lo necesitaremos ahora
import { Server } from 'socket.io';

declare module 'fastify' {
    interface FastifyInstance {
        io: Server;
    }
}

export async function setupSockets(fastify: FastifyInstance) {
    // Usamos 'as any' solo si el tipado de la librería está desactualizado respecto a Fastify
    await fastify.register(socketioServer as any, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    fastify.ready((err) => {
        if (err) {
            fastify.log.error(err);
            return;
        }

        fastify.io.on('connection', (socket) => {
            console.log('✔ Cliente conectado:', socket.id);

            // Pasamos el socket y la instancia de fastify a los handlers
            handleSocketEvents(fastify, socket);

            socket.on('disconnect', () => {
                console.log('❌ Cliente desconectado:', socket.id);
            });
        });
    });
}