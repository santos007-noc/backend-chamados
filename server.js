const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

/* =========================
   CONEXÃO COM BANCO
========================= */

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined
});

pool.getConnection((err, conn) => {
  if (err) {
    console.error("❌ Erro ao conectar no banco:", err.message);
  } else {
    console.log("✅ Banco conectado");
    conn.release();
  }
});

/* =========================
   ROTA TESTE
========================= */

app.get('/', (req, res) => {
  res.json({ mensagem: "API funcionando 🚀" });
});

/* =========================
   LOGIN
========================= */

app.post('/login', (req, res) => {
  const { login, senha } = req.body;

  if (!login || !senha) {
    return res.status(400).json({ erro: "Login e senha obrigatórios" });
  }

  pool.query(
    'SELECT usuario_id, nome, login, tipo_usuario FROM tbusuarios WHERE login = ? AND senha = ?',
    [login, senha],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ erro: "Erro no servidor" });
      }

      if (results.length === 0) {
        return res.status(401).json({ erro: "Credenciais inválidas" });
      }

      res.json({
        mensagem: "Login realizado",
        usuario: results[0]
      });
    }
  );
});

/* =========================
   USUÁRIOS
========================= */

app.post('/usuarios', (req, res) => {
  const { nome, login, senha } = req.body;

  if (!nome || !login || !senha) {
    return res.status(400).json({ erro: "Preencha todos os campos" });
  }

  pool.query(
    'SELECT usuario_id FROM tbusuarios WHERE login = ?',
    [login],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ erro: "Erro ao verificar usuário" });
      }

      if (results.length > 0) {
        return res.status(400).json({ erro: "Login já cadastrado" });
      }

      pool.query(
        'INSERT INTO tbusuarios (nome, login, senha, tipo_usuario) VALUES (?, ?, ?, "cliente")',
        [nome, login, senha],
        (err2, result) => {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ erro: "Erro ao cadastrar usuário" });
          }

          res.json({
            mensagem: "Usuário criado com sucesso",
            id: result.insertId,
            tipo_usuario: "cliente"
          });
        }
      );
    }
  );
});

app.get('/usuarios', (req, res) => {
  const { tipo_usuario } = req.query;

  if (tipo_usuario !== 'admin') {
    return res.status(403).json({ erro: "Apenas admin pode visualizar usuários" });
  }

  pool.query(
    `SELECT usuario_id, nome, login, tipo_usuario
     FROM tbusuarios
     ORDER BY usuario_id DESC`,
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ erro: "Erro ao buscar usuários" });
      }

      res.json(results);
    }
  );
});

app.delete('/usuarios/:id', (req, res) => {
  const { id } = req.params;
  const { tipo_usuario, usuario_id } = req.body;

  if (tipo_usuario !== 'admin') {
    return res.status(403).json({ erro: "Apenas admin pode excluir usuários" });
  }

  if (Number(usuario_id) === Number(id)) {
    return res.status(400).json({ erro: "Você não pode excluir seu próprio usuário" });
  }

  pool.query(
    'SELECT usuario_id, tipo_usuario FROM tbusuarios WHERE usuario_id = ?',
    [id],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ erro: "Erro ao buscar usuário" });
      }

      if (results.length === 0) {
        return res.status(404).json({ erro: "Usuário não encontrado" });
      }

      const usuarioEncontrado = results[0];

      if (usuarioEncontrado.tipo_usuario === 'admin') {
        return res.status(403).json({ erro: "Não é permitido excluir outro administrador" });
      }

      pool.query(
        'DELETE FROM tbusuarios WHERE usuario_id = ?',
        [id],
        (err2) => {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ erro: "Erro ao excluir usuário" });
          }

          res.json({ mensagem: "Usuário excluído com sucesso" });
        }
      );
    }
  );
});

/* =========================
   PROFISSIONAIS
========================= */

app.get('/profissionais', (req, res) => {
  pool.query(
    `SELECT profissional_id, nome, especialidade, telefone, status_profissional
     FROM tbprofissionais
     ORDER BY nome ASC`,
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ erro: "Erro ao buscar profissionais" });
      }

      res.json(results);
    }
  );
});

app.post('/profissionais', (req, res) => {
  const { nome, especialidade, telefone, status_profissional, tipo_usuario } = req.body;

  if (tipo_usuario !== 'admin') {
    return res.status(403).json({ erro: "Apenas admin pode cadastrar profissionais" });
  }

  if (!nome || !especialidade) {
    return res.status(400).json({ erro: "Nome e especialidade são obrigatórios" });
  }

  pool.query(
    `INSERT INTO tbprofissionais (nome, especialidade, telefone, status_profissional)
     VALUES (?, ?, ?, ?)`,
    [nome, especialidade, telefone || null, status_profissional || 'Ativo'],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ erro: "Erro ao cadastrar profissional" });
      }

      res.json({
        mensagem: "Profissional cadastrado com sucesso",
        id: result.insertId
      });
    }
  );
});

app.put('/profissionais/:id', (req, res) => {
  const { id } = req.params;
  const { nome, especialidade, telefone, status_profissional, tipo_usuario } = req.body;

  if (tipo_usuario !== 'admin') {
    return res.status(403).json({ erro: "Apenas admin pode editar profissionais" });
  }

  if (!nome || !especialidade) {
    return res.status(400).json({ erro: "Nome e especialidade são obrigatórios" });
  }

  pool.query(
    `UPDATE tbprofissionais
     SET nome = ?, especialidade = ?, telefone = ?, status_profissional = ?
     WHERE profissional_id = ?`,
    [nome, especialidade, telefone || null, status_profissional || 'Ativo', id],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ erro: "Erro ao atualizar profissional" });
      }

      res.json({ mensagem: "Profissional atualizado com sucesso" });
    }
  );
});

app.delete('/profissionais/:id', (req, res) => {
  const { id } = req.params;
  const { tipo_usuario } = req.body;

  if (tipo_usuario !== 'admin') {
    return res.status(403).json({ erro: "Apenas admin pode excluir profissionais" });
  }

  pool.query(
    'SELECT * FROM tbchamados WHERE profissional_id = ? AND status_chamado != "Concluído"',
    [id],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ erro: "Erro ao verificar profissional" });
      }

      if (results.length > 0) {
        return res.status(400).json({ erro: "Este profissional está vinculado a chamados em aberto/em andamento" });
      }

      pool.query(
        'DELETE FROM tbprofissionais WHERE profissional_id = ?',
        [id],
        (err2) => {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ erro: "Erro ao excluir profissional" });
          }

          res.json({ mensagem: "Profissional excluído com sucesso" });
        }
      );
    }
  );
});

/* =========================
   CHAMADOS
========================= */

app.get('/chamados', (req, res) => {
  const { usuario_id, tipo_usuario } = req.query;

  const baseSql = `
    SELECT 
      c.*,
      u.nome AS nome_usuario,
      u.login AS login_usuario,
      p.nome AS nome_profissional,
      p.especialidade AS especialidade_profissional
    FROM tbchamados c
    LEFT JOIN tbusuarios u ON u.usuario_id = c.usuario_id
    LEFT JOIN tbprofissionais p ON p.profissional_id = c.profissional_id
  `;

  if (tipo_usuario === "cliente") {
    pool.query(
      `${baseSql} WHERE c.usuario_id = ? ORDER BY c.chamado_id DESC`,
      [usuario_id],
      (err, results) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ erro: "Erro ao buscar chamados" });
        }
        res.json(results);
      }
    );
  } else {
    pool.query(
      `${baseSql} ORDER BY c.chamado_id DESC`,
      (err, results) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ erro: "Erro ao buscar chamados" });
        }
        res.json(results);
      }
    );
  }
});

app.post('/chamados', (req, res) => {
  const {
    titulo,
    morador,
    local_chamado,
    descricao,
    usuario_id,
    profissional_id,
    data_agendada,
    observacao_servico,
    prioridade,
    categoria
  } = req.body;

  if (!titulo || !morador || !local_chamado || !usuario_id) {
    return res.status(400).json({ erro: "Campos obrigatórios faltando" });
  }

  const dataAbertura = new Date().toISOString().slice(0, 10);

  pool.query(
    `INSERT INTO tbchamados 
    (titulo, morador, local_chamado, status_chamado, descricao, usuario_id, profissional_id, data_agendada, observacao_servico, data_abertura, prioridade, categoria)
    VALUES (?, ?, ?, "Aberto", ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      titulo,
      morador,
      local_chamado,
      descricao || null,
      usuario_id,
      profissional_id || null,
      data_agendada || null,
      observacao_servico || null,
      dataAbertura,
      prioridade || "Média",
      categoria || "Geral"
    ],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ erro: "Erro ao criar chamado" });
      }

      res.json({
        mensagem: "Chamado criado com sucesso",
        id: result.insertId
      });
    }
  );
});

app.put('/chamados/:id', (req, res) => {
  const { id } = req.params;
  const {
    titulo,
    morador,
    local_chamado,
    descricao,
    status_chamado,
    profissional_id,
    data_agendada,
    data_conclusao,
    observacao_servico,
    tipo_usuario,
    prioridade,
    categoria
  } = req.body;

  if (!titulo || !status_chamado) {
    return res.status(400).json({ erro: "Campos obrigatórios faltando" });
  }

  const statusPermitidos = ["Aberto", "Em andamento", "Concluído"];
  if (!statusPermitidos.includes(status_chamado)) {
    return res.status(400).json({ erro: "Status inválido" });
  }

  pool.query(
    'SELECT * FROM tbchamados WHERE chamado_id = ?',
    [id],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ erro: "Erro ao buscar chamado" });
      }

      if (results.length === 0) {
        return res.status(404).json({ erro: "Chamado não encontrado" });
      }

      const chamado = results[0];

      if (tipo_usuario !== "admin") {
        return res.status(403).json({ erro: "Apenas admin pode editar" });
      }

      if (chamado.status_chamado === "Concluído" || chamado.status_chamado === "Fechado") {
        return res.status(403).json({ erro: "Chamados concluídos não podem ser editados" });
      }

      const conclusaoFinal =
        status_chamado === "Concluído"
          ? (data_conclusao || new Date().toISOString().slice(0, 10))
          : null;

      pool.query(
        `UPDATE tbchamados
         SET titulo = ?, morador = ?, local_chamado = ?, descricao = ?, status_chamado = ?,
             profissional_id = ?, data_agendada = ?, data_conclusao = ?, observacao_servico = ?,
             prioridade = ?, categoria = ?
         WHERE chamado_id = ?`,
        [
          titulo,
          morador || chamado.morador,
          local_chamado || chamado.local_chamado,
          descricao || null,
          status_chamado,
          profissional_id || null,
          data_agendada || null,
          conclusaoFinal,
          observacao_servico || null,
          prioridade || "Média",
          categoria || "Geral",
          id
        ],
        (err2) => {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ erro: "Erro ao atualizar" });
          }

          res.json({ mensagem: "Chamado atualizado com sucesso" });
        }
      );
    }
  );
});

app.delete('/chamados/:id', (req, res) => {
  const { id } = req.params;
  const { tipo_usuario } = req.body;

  pool.query(
    'SELECT * FROM tbchamados WHERE chamado_id = ?',
    [id],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ erro: "Erro ao buscar chamado" });
      }

      if (results.length === 0) {
        return res.status(404).json({ erro: "Chamado não encontrado" });
      }

      const chamado = results[0];

      if (tipo_usuario !== "admin") {
        return res.status(403).json({ erro: "Apenas admin pode excluir" });
      }

      if (chamado.status_chamado === "Concluído" || chamado.status_chamado === "Fechado") {
        return res.status(403).json({ erro: "Chamados concluídos não podem ser excluídos" });
      }

      pool.query(
        'DELETE FROM tbchamados WHERE chamado_id = ?',
        [id],
        (err2) => {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ erro: "Erro ao excluir" });
          }

          res.json({ mensagem: "Chamado excluído com sucesso" });
        }
      );
    }
  );
});

/* =========================
   START
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});