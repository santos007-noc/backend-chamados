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
   UTILITÁRIOS
========================= */

function limparTexto(valor) {
  return String(valor || '').trim();
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function validarDataISO(data) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(data || ''));
}

function validarHoraHHMM(hora) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(hora || ''));
}

function gerarHorariosComerciais() {
  const horarios = [];
  for (let h = 8; h <= 16; h++) {
    horarios.push(`${String(h).padStart(2, '0')}:00`);
    horarios.push(`${String(h).padStart(2, '0')}:30`);
  }
  return horarios;
}

function proximoHorarioValidoHoje() {
  const agora = new Date();
  let hora = agora.getHours();
  let minuto = agora.getMinutes();

  if (minuto > 0 && minuto <= 30) {
    minuto = 30;
  } else if (minuto > 30) {
    hora += 1;
    minuto = 0;
  } else {
    minuto = 0;
  }

  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

function responderErroBanco(res, err, mensagem) {
  console.error(err);
  return res.status(500).json({ erro: mensagem });
}

/* =========================
   TESTE
========================= */

app.get('/', (req, res) => {
  res.json({ mensagem: "API funcionando 🚀" });
});

/* =========================
   LOGIN
========================= */

app.post('/login', (req, res) => {
  const login = limparTexto(req.body.login);
  const senha = limparTexto(req.body.senha);

  if (!login || !senha) {
    return res.status(400).json({ erro: "Login e senha obrigatórios" });
  }

  pool.query(
    'SELECT usuario_id, nome, login, tipo_usuario FROM tbusuarios WHERE login = ? AND senha = ?',
    [login, senha],
    (err, results) => {
      if (err) {
        return responderErroBanco(res, err, "Erro no servidor");
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
  const nome = limparTexto(req.body.nome);
  const login = limparTexto(req.body.login);
  const senha = limparTexto(req.body.senha);

  if (!nome || !login || !senha) {
    return res.status(400).json({ erro: "Preencha todos os campos" });
  }

  pool.query(
    'SELECT usuario_id FROM tbusuarios WHERE login = ?',
    [login],
    (err, results) => {
      if (err) {
        return responderErroBanco(res, err, "Erro ao verificar usuário");
      }

      if (results.length > 0) {
        return res.status(400).json({ erro: "Login já cadastrado" });
      }

      pool.query(
        'INSERT INTO tbusuarios (nome, login, senha, tipo_usuario) VALUES (?, ?, ?, ?)',
        [nome, login, senha, 'cliente'],
        (err2, result) => {
          if (err2) {
            return responderErroBanco(res, err2, "Erro ao cadastrar usuário");
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
  const tipoUsuario = limparTexto(req.query.tipo_usuario);

  if (tipoUsuario !== 'admin') {
    return res.status(403).json({ erro: "Apenas admin pode visualizar usuários" });
  }

  pool.query(
    `SELECT usuario_id, nome, login, tipo_usuario
     FROM tbusuarios
     ORDER BY usuario_id DESC`,
    (err, results) => {
      if (err) {
        return responderErroBanco(res, err, "Erro ao buscar usuários");
      }

      res.json(results);
    }
  );
});

app.delete('/usuarios/:id', (req, res) => {
  const { id } = req.params;
  const tipoUsuario = limparTexto(req.body.tipo_usuario);
  const usuarioId = Number(req.body.usuario_id);

  if (tipoUsuario !== 'admin') {
    return res.status(403).json({ erro: "Apenas admin pode excluir usuários" });
  }

  if (usuarioId === Number(id)) {
    return res.status(400).json({ erro: "Você não pode excluir seu próprio usuário" });
  }

  pool.query(
    'SELECT usuario_id, tipo_usuario FROM tbusuarios WHERE usuario_id = ?',
    [id],
    (err, results) => {
      if (err) {
        return responderErroBanco(res, err, "Erro ao buscar usuário");
      }

      if (results.length === 0) {
        return res.status(404).json({ erro: "Usuário não encontrado" });
      }

      if (results[0].tipo_usuario === 'admin') {
        return res.status(403).json({ erro: "Não é permitido excluir outro administrador" });
      }

      pool.query(
        'DELETE FROM tbusuarios WHERE usuario_id = ?',
        [id],
        (err2) => {
          if (err2) {
            return responderErroBanco(res, err2, "Erro ao excluir usuário");
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
        return responderErroBanco(res, err, "Erro ao buscar profissionais");
      }

      res.json(results);
    }
  );
});

app.post('/profissionais', (req, res) => {
  const nome = limparTexto(req.body.nome);
  const especialidade = limparTexto(req.body.especialidade);
  const telefone = limparTexto(req.body.telefone);
  const statusProfissional = limparTexto(req.body.status_profissional) || 'Ativo';
  const tipoUsuario = limparTexto(req.body.tipo_usuario);

  if (tipoUsuario !== 'admin') {
    return res.status(403).json({ erro: "Apenas admin pode cadastrar profissionais" });
  }

  if (!nome || !especialidade) {
    return res.status(400).json({ erro: "Nome e especialidade são obrigatórios" });
  }

  pool.query(
    `INSERT INTO tbprofissionais (nome, especialidade, telefone, status_profissional)
     VALUES (?, ?, ?, ?)`,
    [nome, especialidade, telefone || null, statusProfissional],
    (err, result) => {
      if (err) {
        return responderErroBanco(res, err, "Erro ao cadastrar profissional");
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
  const nome = limparTexto(req.body.nome);
  const especialidade = limparTexto(req.body.especialidade);
  const telefone = limparTexto(req.body.telefone);
  const statusProfissional = limparTexto(req.body.status_profissional) || 'Ativo';
  const tipoUsuario = limparTexto(req.body.tipo_usuario);

  if (tipoUsuario !== 'admin') {
    return res.status(403).json({ erro: "Apenas admin pode editar profissionais" });
  }

  if (!nome || !especialidade) {
    return res.status(400).json({ erro: "Nome e especialidade são obrigatórios" });
  }

  pool.query(
    `UPDATE tbprofissionais
     SET nome = ?, especialidade = ?, telefone = ?, status_profissional = ?
     WHERE profissional_id = ?`,
    [nome, especialidade, telefone || null, statusProfissional, id],
    (err) => {
      if (err) {
        return responderErroBanco(res, err, "Erro ao atualizar profissional");
      }

      res.json({ mensagem: "Profissional atualizado com sucesso" });
    }
  );
});

app.delete('/profissionais/:id', (req, res) => {
  const { id } = req.params;
  const tipoUsuario = limparTexto(req.body.tipo_usuario);

  if (tipoUsuario !== 'admin') {
    return res.status(403).json({ erro: "Apenas admin pode excluir profissionais" });
  }

  pool.query(
    'SELECT * FROM tbchamados WHERE profissional_id = ? AND status_chamado != ?',
    [id, 'Concluído'],
    (err, results) => {
      if (err) {
        return responderErroBanco(res, err, "Erro ao verificar profissional");
      }

      if (results.length > 0) {
        return res.status(400).json({ erro: "Este profissional está vinculado a chamados em aberto/em andamento" });
      }

      pool.query(
        'DELETE FROM tbprofissionais WHERE profissional_id = ?',
        [id],
        (err2) => {
          if (err2) {
            return responderErroBanco(res, err2, "Erro ao excluir profissional");
          }

          res.json({ mensagem: "Profissional excluído com sucesso" });
        }
      );
    }
  );
});

/* =========================
   HORÁRIOS DISPONÍVEIS
========================= */

app.get('/profissionais/:id/horarios', (req, res) => {
  const profissionalId = Number(req.params.id);
  const data = limparTexto(req.query.data);
  const ignorarChamadoId = req.query.ignorar_chamado_id ? Number(req.query.ignorar_chamado_id) : null;

  if (!profissionalId || !validarDataISO(data)) {
    return res.status(400).json({ erro: "Profissional e data são obrigatórios" });
  }

  const hoje = hojeISO();
  if (data < hoje) {
    return res.json([]);
  }

  pool.query(
    `SELECT hora_agendada
     FROM tbchamados
     WHERE profissional_id = ?
       AND data_agendada = ?
       AND hora_agendada IS NOT NULL
       AND status_chamado IN ('Aberto', 'Em andamento')
       ${ignorarChamadoId ? 'AND chamado_id != ?' : ''}`,
    ignorarChamadoId ? [profissionalId, data, ignorarChamadoId] : [profissionalId, data],
    (err, results) => {
      if (err) {
        return responderErroBanco(res, err, "Erro ao buscar horários");
      }

      let horarios = gerarHorariosComerciais();

      if (data === hoje) {
        const minimoHoje = proximoHorarioValidoHoje();
        horarios = horarios.filter(h => h >= minimoHoje);
      }

      const ocupados = results.map(r => r.hora_agendada).filter(Boolean);
      const livres = horarios.filter(h => !ocupados.includes(h));

      res.json(livres);
    }
  );
});

/* =========================
   CHAMADOS
========================= */

app.get('/chamados', (req, res) => {
  const usuarioId = req.query.usuario_id;
  const tipoUsuario = limparTexto(req.query.tipo_usuario);

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

  if (tipoUsuario === "cliente") {
    pool.query(
      `${baseSql} WHERE c.usuario_id = ? ORDER BY c.chamado_id DESC`,
      [usuarioId],
      (err, results) => {
        if (err) {
          return responderErroBanco(res, err, "Erro ao buscar chamados");
        }
        res.json(results);
      }
    );
  } else {
    pool.query(
      `${baseSql} ORDER BY c.chamado_id DESC`,
      (err, results) => {
        if (err) {
          return responderErroBanco(res, err, "Erro ao buscar chamados");
        }
        res.json(results);
      }
    );
  }
});

app.post('/chamados', (req, res) => {
  const titulo = limparTexto(req.body.titulo);
  const localChamado = limparTexto(req.body.local_chamado);
  const descricao = limparTexto(req.body.descricao);
  const tipoUsuario = limparTexto(req.body.tipo_usuario);
  const usuarioId = Number(req.body.usuario_id);
  const categoria = limparTexto(req.body.categoria) || 'Geral';
  const dataAgendada = req.body.data_agendada || null;
  const horaAgendada = req.body.hora_agendada || null;

  if (!titulo || !localChamado || !usuarioId || !categoria) {
    return res.status(400).json({ erro: "Campos obrigatórios faltando" });
  }

  const categoriasPermitidas = ['Elétrica', 'Hidráulica', 'Pintura', 'Estrutural', 'Geral'];
  const prioridadesPermitidas = ['A definir', 'Baixa', 'Média', 'Alta'];

  if (!categoriasPermitidas.includes(categoria)) {
    return res.status(400).json({ erro: "Categoria inválida" });
  }

  if (dataAgendada && !validarDataISO(dataAgendada)) {
    return res.status(400).json({ erro: "Data inválida" });
  }

  if (horaAgendada && !validarHoraHHMM(horaAgendada)) {
    return res.status(400).json({ erro: "Horário inválido" });
  }

  if (dataAgendada && dataAgendada < hojeISO()) {
    return res.status(400).json({ erro: "Não é permitido escolher data passada" });
  }

  pool.query(
    'SELECT usuario_id, nome FROM tbusuarios WHERE usuario_id = ?',
    [usuarioId],
    (err, usuariosEncontrados) => {
      if (err) {
        return responderErroBanco(res, err, "Erro ao validar usuário");
      }

      if (usuariosEncontrados.length === 0) {
        return res.status(404).json({ erro: "Usuário não encontrado" });
      }

      const usuarioBanco = usuariosEncontrados[0];

      const moradorFinal = tipoUsuario === 'admin'
        ? (limparTexto(req.body.morador) || usuarioBanco.nome)
        : usuarioBanco.nome;

      const statusFinal = tipoUsuario === 'admin'
        ? (limparTexto(req.body.status_chamado) || 'Aberto')
        : 'Aberto';

      const profissionalIdFinal = tipoUsuario === 'admin'
        ? (req.body.profissional_id || null)
        : null;

      const prioridadeFinal = tipoUsuario === 'admin'
        ? (limparTexto(req.body.prioridade) || 'Média')
        : 'A definir';

      const observacaoFinal = tipoUsuario === 'admin'
        ? (limparTexto(req.body.observacao_servico) || null)
        : null;

      if (!prioridadesPermitidas.includes(prioridadeFinal)) {
        return res.status(400).json({ erro: "Prioridade inválida" });
      }

      const dataAbertura = hojeISO();

      pool.query(
        `INSERT INTO tbchamados 
        (titulo, morador, local_chamado, status_chamado, descricao, usuario_id, profissional_id, data_agendada, hora_agendada, observacao_servico, data_abertura, prioridade, categoria)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          titulo,
          moradorFinal,
          localChamado,
          statusFinal,
          descricao || null,
          usuarioId,
          profissionalIdFinal,
          dataAgendada,
          horaAgendada,
          observacaoFinal,
          dataAbertura,
          prioridadeFinal,
          categoria
        ],
        (err2, result) => {
          if (err2) {
            return responderErroBanco(res, err2, "Erro ao criar chamado");
          }

          res.json({
            mensagem: "Chamado criado com sucesso",
            id: result.insertId
          });
        }
      );
    }
  );
});

app.put('/chamados/:id', (req, res) => {
  const { id } = req.params;
  const tipoUsuario = limparTexto(req.body.tipo_usuario);

  if (tipoUsuario !== "admin") {
    return res.status(403).json({ erro: "Apenas admin pode editar" });
  }

  const titulo = limparTexto(req.body.titulo);
  const morador = limparTexto(req.body.morador);
  const localChamado = limparTexto(req.body.local_chamado);
  const descricao = limparTexto(req.body.descricao);
  const statusChamado = limparTexto(req.body.status_chamado);
  const profissionalId = req.body.profissional_id || null;
  const dataAgendada = req.body.data_agendada || null;
  const horaAgendada = req.body.hora_agendada || null;
  const dataConclusao = req.body.data_conclusao || null;
  const observacaoServico = limparTexto(req.body.observacao_servico);
  const prioridade = limparTexto(req.body.prioridade) || 'Média';
  const categoria = limparTexto(req.body.categoria) || 'Geral';

  if (!titulo || !morador || !localChamado || !statusChamado || !categoria) {
    return res.status(400).json({ erro: "Campos obrigatórios faltando" });
  }

  const statusPermitidos = ['Aberto', 'Em andamento', 'Concluído'];
  const categoriasPermitidas = ['Elétrica', 'Hidráulica', 'Pintura', 'Estrutural', 'Geral'];
  const prioridadesPermitidas = ['A definir', 'Baixa', 'Média', 'Alta'];

  if (!statusPermitidos.includes(statusChamado)) {
    return res.status(400).json({ erro: "Status inválido" });
  }

  if (!categoriasPermitidas.includes(categoria)) {
    return res.status(400).json({ erro: "Categoria inválida" });
  }

  if (!prioridadesPermitidas.includes(prioridade)) {
    return res.status(400).json({ erro: "Prioridade inválida" });
  }

  if (dataAgendada && !validarDataISO(dataAgendada)) {
    return res.status(400).json({ erro: "Data inválida" });
  }

  if (horaAgendada && !validarHoraHHMM(horaAgendada)) {
    return res.status(400).json({ erro: "Horário inválido" });
  }

  if (dataAgendada && dataAgendada < hojeISO() && statusChamado !== 'Concluído') {
    return res.status(400).json({ erro: "Não é permitido agendar data passada" });
  }

  pool.query(
    'SELECT * FROM tbchamados WHERE chamado_id = ?',
    [id],
    (err, results) => {
      if (err) {
        return responderErroBanco(res, err, "Erro ao buscar chamado");
      }

      if (results.length === 0) {
        return res.status(404).json({ erro: "Chamado não encontrado" });
      }

      const chamado = results[0];

      if (chamado.status_chamado === "Concluído" || chamado.status_chamado === "Fechado") {
        return res.status(403).json({ erro: "Chamados concluídos não podem ser editados" });
      }

      const concluirData = statusChamado === 'Concluído'
        ? (dataConclusao || hojeISO())
        : null;

      const verificarDisponibilidade = () => {
        if (!profissionalId || !dataAgendada || !horaAgendada) {
          return atualizarChamado();
        }

        pool.query(
          `SELECT chamado_id
           FROM tbchamados
           WHERE profissional_id = ?
             AND data_agendada = ?
             AND hora_agendada = ?
             AND status_chamado IN ('Aberto', 'Em andamento')
             AND chamado_id != ?`,
          [profissionalId, dataAgendada, horaAgendada, id],
          (err2, conflito) => {
            if (err2) {
              return responderErroBanco(res, err2, "Erro ao validar agenda do profissional");
            }

            if (conflito.length > 0) {
              return res.status(400).json({ erro: "Horário indisponível para este profissional" });
            }

            atualizarChamado();
          }
        );
      };

      const atualizarChamado = () => {
        pool.query(
          `UPDATE tbchamados
           SET titulo = ?, morador = ?, local_chamado = ?, descricao = ?, status_chamado = ?,
               profissional_id = ?, data_agendada = ?, hora_agendada = ?, data_conclusao = ?,
               observacao_servico = ?, prioridade = ?, categoria = ?
           WHERE chamado_id = ?`,
          [
            titulo,
            morador,
            localChamado,
            descricao || null,
            statusChamado,
            profissionalId,
            dataAgendada,
            horaAgendada,
            concluirData,
            observacaoServico || null,
            prioridade,
            categoria,
            id
          ],
          (err3) => {
            if (err3) {
              return responderErroBanco(res, err3, "Erro ao atualizar chamado");
            }

            res.json({ mensagem: "Chamado atualizado com sucesso" });
          }
        );
      };

      verificarDisponibilidade();
    }
  );
});

app.delete('/chamados/:id', (req, res) => {
  const { id } = req.params;
  const tipoUsuario = limparTexto(req.body.tipo_usuario);

  pool.query(
    'SELECT * FROM tbchamados WHERE chamado_id = ?',
    [id],
    (err, results) => {
      if (err) {
        return responderErroBanco(res, err, "Erro ao buscar chamado");
      }

      if (results.length === 0) {
        return res.status(404).json({ erro: "Chamado não encontrado" });
      }

      const chamado = results[0];

      if (tipoUsuario !== "admin") {
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
            return responderErroBanco(res, err2, "Erro ao excluir chamado");
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