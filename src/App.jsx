import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { io } from 'socket.io-client';
import './App.css';

// Conexión con el servidor WebSocket
const socket = io('http://localhost:3000');

// Configuración del juego
const gameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#5c8f41',
  scene: {
    preload,
    create,
    update
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  }
};

// Tamaño del tablero y los tiles
const GRID_SIZE = 50;
const BOARD_WIDTH = 13;
const BOARD_HEIGHT = 11;

// Matriz que define la estructura del tablero
const BOARD_MATRIX = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
];

let players = {};
let walls;
let cursors;
let player;
let spaceKey;

// Precargar imágenes
function preload() {
  this.load.image('background', '/assets/background.png');
  this.load.image('bomb', '/assets/bomba.png')
  this.load.image('wall', '/assets/wall.png');
  this.load.image('player', '/assets/player.png');
}

// Crear el juego
function create() {
  // Fondo
  const background = this.add.image(0, 0, 'background').setOrigin(0);
  background.setDisplaySize(window.innerWidth, window.innerHeight);

  // Centrar el tablero
  const offsetX = (this.sys.game.config.width - BOARD_WIDTH * GRID_SIZE) / 2;
  const offsetY = (this.sys.game.config.height - BOARD_HEIGHT * GRID_SIZE) / 2;

  // Crear grupo de paredes
  walls = this.physics.add.staticGroup();

  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (BOARD_MATRIX[y][x] === 1) {
        const wall = walls.create(offsetX + x * GRID_SIZE + GRID_SIZE / 2, offsetY + y * GRID_SIZE + GRID_SIZE / 2, 'wall');
        const wallScaleFactor = GRID_SIZE / wall.width;
        wall.setScale(wallScaleFactor);
        wall.refreshBody();
      }
    }
  }

  // Crear el jugador y registrarlo en el servidor
  player = this.physics.add.sprite(offsetX + GRID_SIZE * 1.5, offsetY + GRID_SIZE * 1.5, 'player');
  player.setScale((GRID_SIZE * 0.8) / player.width);
  player.body.setSize(player.width * 0.8, player.height * 0.8);
  player.body.setOffset(player.width * 0.1, player.height * 0.1);
  this.physics.add.collider(player, walls);

  socket.emit('newPlayer', { id: socket.id, x: player.x, y: player.y });

  // Esto es como asigno las teclas como movimiento
  cursors = this.input.keyboard.createCursorKeys();

  this.bombs = this.physics.add.group();

  // Esto es como asigno el espacio para colocar una bomba
  spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

  // Escuchar la lista de jugadores del servidor
  socket.on('players', (data) => {
    // Primero eliminamos los jugadores que ya no existen
    Object.keys(players).forEach(id => {
      if (!data[id] && id !== socket.id) {
        if (players[id]) {
          players[id].destroy();
          delete players[id];
        }
      }
    });

    // Luego agregamos o actualizamos los jugadores existentes
    Object.entries(data).forEach(([id, playerData]) => {
      if (id !== socket.id) { // No crear un sprite para nosotros mismos
        if (!players[id]) {
          // Crear nuevo sprite de jugador para otros jugadores
          players[id] = this.physics.add.sprite(playerData.x, playerData.y, 'player');
          players[id].setScale((GRID_SIZE * 0.8) / players[id].width);
          this.physics.add.collider(players[id], walls); // Añadir colisión con las paredes
        } else {
          // Actualizar posición de jugador existente
          players[id].x = playerData.x;
          players[id].y = playerData.y;
        }
      }
    });
  });

  // Escuchar movimiento de otros jugadores
  socket.on('playerMoved', (data) => {
    if (players[data.id]) {
      // Usar la interpolación incorporada de Phaser para un movimiento más suave
      this.tweens.add({
        targets: players[data.id],
        x: data.x,
        y: data.y,
        duration: 100, // Ajustar para la suavidad deseada
        ease: 'Linear'
      });
    }
  });

  socket.on('addBomb', (data) => {
    const bombX = data.x;
    const bombY = data.y;

    // Crear la bomba en la escena
    const bomb = this.physics.add.sprite(bombX, bombY, 'bomb');
    bomb.setScale((GRID_SIZE * 0.8) / bomb.width);
    bomb.setDepth(1); // para que este por encima del fondo
  });

  }

  // Actualizar el estado del juego esto es del lado del cliente
  // y se emite al servidor para que le diga a todos los demas que se actualicen 
  function update() {
  const PLAYER_SPEED = 200;

  if (cursors.left.isDown) {
    player.setVelocityX(-PLAYER_SPEED);
    player.setVelocityY(0);
  } else if (cursors.right.isDown) {
    player.setVelocityX(PLAYER_SPEED);
    player.setVelocityY(0);
  } else if (cursors.up.isDown) {
    player.setVelocityY(-PLAYER_SPEED);
    player.setVelocityX(0);
  } else if (cursors.down.isDown) {
    player.setVelocityY(PLAYER_SPEED);
    player.setVelocityX(0);
  } else {
    player.setVelocityX(0);
    player.setVelocityY(0);
  }



  // Emitir movimiento solo si cambió la posición
  if (socket && player) {
    socket.emit('move', { id: socket.id, x: player.x, y: player.y });
  }

  // Emite la creacion de una bomba
  if (Phaser.Input.Keyboard.JustDown(spaceKey)) {
    const bomb = this.bombs.create(player.x, player.y, 'bomb');
    bomb.setScale((GRID_SIZE * 0.8) / bomb.width);
    bomb.setImmovable(true);
    socket.emit('addBomb', { id: socket.id, x: player.x, y: player.y })

    // Esto es un timer para que la bomba desaparezca
    this.time.delayedCall(3000, () => {
      bomb.destroy();
      
    });
  }
}

// Componente React
function App() {
  const gameContainerRef = useRef(null);
  const gameRef = useRef(null);

  useEffect(() => {
    if (gameContainerRef.current && !gameRef.current) {
      gameRef.current = new Phaser.Game({ ...gameConfig, parent: gameContainerRef.current });
    }


  }, []);

  return (
    <div className="game-container">
      <div ref={gameContainerRef} className="phaser-container" />
    </div>
  );
}

export default App;
