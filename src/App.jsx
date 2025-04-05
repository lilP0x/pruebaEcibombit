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
  [1, 0, 2, 0, 2, 0, 1, 0, 1, 0, 1, 0, 1],
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
let dWalls;
let cursors;
let player;
let spaceKey;
let playerHealth = 100;
let healthText;
let playerDamaged = false;

// Precargar imágenes
function preload() {
  this.load.image('background', '/assets/background.png');
  this.load.image('destructive', '/assets/destructiveWall.png');
  this.load.image('bomb', '/assets/bomba.png');
  this.load.image('wall', '/assets/wall.png');
  this.load.image('player', '/assets/player.png');
  this.load.image('explosion', '/assets/explosion.png'); 
}

// Crear el juego
function create() {
  // Fondo
  const background = this.add.image(0, 0, 'background').setOrigin(0);
  background.setDisplaySize(window.innerWidth, window.innerHeight);

  // Centrar el tablero
  const offsetX = (this.sys.game.config.width - BOARD_WIDTH * GRID_SIZE) / 2;
  const offsetY = (this.sys.game.config.height - BOARD_HEIGHT * GRID_SIZE) / 2;

  this.offsetX = offsetX;
  this.offsetY = offsetY;

  // Crear grupo de paredes
  walls = this.physics.add.staticGroup();

  // Crear paredes destructibles
  dWalls = this.physics.add.staticGroup();

  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (BOARD_MATRIX[y][x] === 1) {
        const wall = walls.create(offsetX + x * GRID_SIZE + GRID_SIZE / 2, offsetY + y * GRID_SIZE + GRID_SIZE / 2, 'wall');
        const wallScaleFactor = GRID_SIZE / wall.width;
        wall.setScale(wallScaleFactor);
        wall.refreshBody();
      } else if (BOARD_MATRIX[y][x] === 2) {
        const wall = dWalls.create(offsetX + x * GRID_SIZE + GRID_SIZE / 2, offsetY + y * GRID_SIZE + GRID_SIZE / 2, 'destructive');
        wall.setData('tileX', x);
        wall.setData('tileY', y);
        wall.setScale(GRID_SIZE / wall.width);
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
  this.physics.add.collider(player, dWalls);
  
  // Añadir indicador de salud
  healthText = this.add.text(16, 16, `Salud: ${playerHealth}`, { fontSize: '24px', fill: '#fff' });

  socket.emit('newPlayer', { id: socket.id, x: player.x, y: player.y, health: playerHealth });

  // Esto es como asigno las teclas como movimiento
  cursors = this.input.keyboard.createCursorKeys();

  this.bombs = this.physics.add.group();
  this.explosions = this.physics.add.group();

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
          players[id].setData('health', playerData.health || 100);
          
          // Añadir texto de salud sobre el jugador
          players[id].healthText = this.add.text(playerData.x, playerData.y - 20, `${playerData.health || 100}`, { fontSize: '16px', fill: '#fff' });
          
          this.physics.add.collider(players[id], walls);
          this.physics.add.collider(players[id], dWalls);
        } else {
          // Actualizar posición y salud de jugador existente
          players[id].x = playerData.x;
          players[id].y = playerData.y;
          
          // Actualizar la salud si cambió
          if (playerData.health !== undefined && players[id].getData('health') !== playerData.health) {
            players[id].setData('health', playerData.health);
            players[id].healthText.setText(`${playerData.health}`);
            
            // Efecto visual de daño
            if (playerData.health < players[id].getData('health')) {
              this.tweens.add({
                targets: players[id],
                alpha: 0.5,
                yoyo: true,
                duration: 100,
                repeat: 2
              });
            }
          }
          
          // Mover el texto de salud con el jugador
          players[id].healthText.setPosition(playerData.x - 10, playerData.y - 20);
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
        duration: 100,
        ease: 'Linear'
      });
      
      // Mover también el texto de salud
      if (players[data.id].healthText) {
        players[data.id].healthText.setPosition(data.x - 10, data.y - 20);
      }
    }
  });

  socket.on('addBomb', (data) => {
    const bombX = data.x;
    const bombY = data.y;

    const bomb = this.physics.add.sprite(bombX, bombY, 'bomb');
    bomb.setScale((GRID_SIZE * 0.8) / bomb.width);
    bomb.setDepth(1);

    this.time.delayedCall(3000, () => {
      bomb.destroy();

      // Mostrar efecto de explosión
      this.createExplosion(bombX, bombY, this.offsetX, this.offsetY);
    });
  });

  socket.on('bombExploded', (data) => {
    const { tileX, tileY, playersHit } = data;
    
    // Calcular coordenadas reales
    const bombX = this.offsetX + tileX * GRID_SIZE + GRID_SIZE / 2;
    const bombY = this.offsetY + tileY * GRID_SIZE + GRID_SIZE / 2;
    
    // Mostrar efecto de explosión
    this.createExplosion(bombX, bombY, this.offsetX, this.offsetY);
    
    // Destruir paredes
    const directions = [
      { dx: 0, dy: 0 },   // centro
      { dx: 1, dy: 0 },   // derecha
      { dx: -1, dy: 0 },  // izquierda
      { dx: 0, dy: 1 },   // abajo
      { dx: 0, dy: -1 },  // arriba
    ];
  
    directions.forEach(({ dx, dy }) => {
      const x = tileX + dx;
      const y = tileY + dy;
  
      if (BOARD_MATRIX[y] && BOARD_MATRIX[y][x] === 2) {
        dWalls.getChildren().forEach((wall) => {
          if (wall.getData('tileX') === x && wall.getData('tileY') === y) {
            wall.destroy();
            BOARD_MATRIX[y][x] = 0; // Marcar como vacío
          }
        });
      }
    });
    
    // Verificar si el jugador local fue dañado
    if (playersHit && playersHit.includes(socket.id)) {
      playerHealth -= 25; // Restar 25 de salud
      healthText.setText(`Salud: ${playerHealth}`);
      
      // Efectos visuales de daño
      this.cameras.main.shake(200, 0.01);
      playerDamaged = true;
      player.setTint(0xff0000);
      
      this.time.delayedCall(200, () => {
        player.clearTint();
        playerDamaged = false;
      });
      
      // Si la salud llega a 0, el jugador muere
      if (playerHealth <= 0) {
        socket.emit('playerDied', { id: socket.id });
        playerHealth = 0;
        // Mostrar mensaje de muerte
        const gameOverText = this.add.text(
          this.cameras.main.centerX, 
          this.cameras.main.centerY, 
          'GAME OVER', 
          { fontSize: '64px', fill: '#ff0000' }
        ).setOrigin(0.5);
      }
      
      // Informar al servidor de la salud actualizada
      socket.emit('updateHealth', { id: socket.id, health: playerHealth });
    }
  });
  
  // Escuchar actualizaciones de salud
  socket.on('playerHealthUpdate', (data) => {
    if (data.id === socket.id) {
      // Actualizar nuestra propia salud si el servidor lo indica
      playerHealth = data.health;
      healthText.setText(`Salud: ${playerHealth}`);
    } else if (players[data.id]) {
      // Actualizar salud de otro jugador
      players[data.id].setData('health', data.health);
      if (players[data.id].healthText) {
        players[data.id].healthText.setText(`${data.health}`);
      }
      
      // Efecto visual de daño
      this.tweens.add({
        targets: players[data.id],
        alpha: 0.5,
        yoyo: true,
        duration: 100,
        repeat: 2
      });
    }
  });
  
  // Escuchar cuando un jugador muere
  socket.on('playerDied', (data) => {
    if (players[data.id]) {
      // Mostrar animación de muerte
      this.tweens.add({
        targets: players[data.id],
        alpha: 0,
        scale: 0,
        duration: 1000,
        onComplete: () => {
          if (players[data.id].healthText) {
            players[data.id].healthText.destroy();
          }
          players[data.id].destroy();
          delete players[data.id];
        }
      });
    }
  });

  this.createExplosion = (x, y) => {
    const tileX = Math.floor((x - offsetX) / GRID_SIZE);
    const tileY = Math.floor((y - offsetY) / GRID_SIZE);
    
    const directions = [
      { dx: 0, dy: 0 },   // centro
      { dx: 1, dy: 0 },   // derecha
      { dx: -1, dy: 0 },  // izquierda
      { dx: 0, dy: 1 },   // abajo
      { dx: 0, dy: -1 },  // arriba
    ];
    
    directions.forEach(({ dx, dy }) => {
      const expX = x + dx * GRID_SIZE;
      const expY = y + dy * GRID_SIZE;

      const wallX = tileX + dx;
      const wallY = tileY + dy;

      if (!(BOARD_MATRIX[wallY] && BOARD_MATRIX[wallY][wallX] === 1)) {
        const explosion = this.explosions.create(expX, expY, 'explosion');
        explosion.setScale((GRID_SIZE * 0.9) / explosion.width);
        explosion.setDepth(2);
        explosion.setAlpha(0.8);
        
        this.tweens.add({
          targets: explosion,
          alpha: 0,
          duration: 500,
          onComplete: () => {
            explosion.destroy();
          }
        });
      }
    });
};


}

// Actualizar el estado del juego
function update() {
  if (playerHealth <= 0) {
    // Si el jugador está muerto, no puede moverse
    player.setVelocity(0, 0);
    return;
  }
  
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

  // Emitir movimiento solo si cambio la posicion y no está dañado
  if (socket && player && !playerDamaged) {
    socket.emit('move', { id: socket.id, x: player.x, y: player.y, health: playerHealth });
  }

  // Emite la creacion de una bomba
  if (Phaser.Input.Keyboard.JustDown(spaceKey) && playerHealth > 0) {
    const bomb = this.bombs.create(player.x, player.y, 'bomb');
    bomb.setScale((GRID_SIZE * 0.8) / bomb.width);
    bomb.setImmovable(true);

    // Calcula la posicion en tiles
    const tileX = Math.floor((player.x - this.offsetX) / GRID_SIZE);
    const tileY = Math.floor((player.y - this.offsetY) / GRID_SIZE);

    socket.emit('addBomb', { id: socket.id, x: player.x, y: player.y, tileX, tileY });

    // Timer para explosion
    this.time.delayedCall(3000, () => {
      bomb.destroy();

      // Crear efecto de explosión
      this.createExplosion(player.x, player.y, this.offsetX, this.offsetY);
      
      // Emite al servidor que exploto
      socket.emit('bombExploded', {
        id: socket.id,
        tileX,
        tileY
      });
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