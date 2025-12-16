// =================================================================
// DADOS FIXOS (MISSÕES)
// =================================================================

function obterMissoes() {
    return [
        { nome: "Atividade em Sala", xp: 200 },
        { nome: "Atividade em Casa", xp: 500 },
        { nome: "Trabalho em Grupo", xp: 500 },
        { nome: "Avaliação Mensal", xp: 1000 },
        { nome: "Desafio Especial", xp: 1000 }
    ];
}

// =================================================================
// FUNÇÕES DE CÁLCULO E BANCO DE DADOS
// =================================================================

async function recalcularXPTurma(turmaId) { 
    if (!turmaId) return;
    try {
        const alunosSnapshot = await window.db.collection("alunos")
                                             .where("turmaId", "==", turmaId)
                                             .get();
        let novoXPTotal = 0;
        alunosSnapshot.forEach(doc => {
            novoXPTotal += (doc.data().xpTotal || 0);
        });

        await window.db.collection("turmas").doc(turmaId).update({
            xpAtual: novoXPTotal
        });
    } catch (error) {
        console.error("Erro ao recalcular turma:", error);
    }
}

async function obterTurmas() {
    try {
        const snapshot = await window.db.collection("turmas").orderBy("nome").get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao obter turmas:", error);
        return [];
    }
}

async function obterAlunosPorTurma(turmaId) {
    if (!turmaId) return [];
    try {
        const snapshot = await window.db.collection("alunos")
            .where("turmaId", "==", turmaId)
            .orderBy("nome")
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao obter alunos:", error);
        return [];
    }
}

// ATUALIZAÇÃO: Agora aceita XP positivo ou negativo
async function atualizarPontuacao(alunoDocId, xpMissao = 0, xpExtra = 0, xpPenalidade = 0) {
    if (!alunoDocId) return { success: false, message: "Aluno não identificado" };

    try {
        const alunoRef = window.db.collection("alunos").doc(alunoDocId);
        const doc = await alunoRef.get();
        if (!doc.exists) throw new Error("Aluno não encontrado");

        const dados = doc.data();
        
        // Novos totais acumulados
        const novoXPMissoes = (dados.xpMissoes || 0) + xpMissao;
        const novoXPExtra = (dados.xpExtra || 0) + xpExtra;
        const novoXPPerdidos = (dados.xpPenalidade || 0) + xpPenalidade; // xpPenalidade vem como valor negativo (ex: -50)
        
        // XP Total Geral (Soma de tudo)
        let novoTotal = novoXPMissoes + novoXPExtra + novoXPPerdidos;
        if (novoTotal < 0) novoTotal = 0;

        await alunoRef.update({
            xpMissoes: novoXPMissoes,
            xpExtra: novoXPExtra,
            xpPenalidade: novoXPPerdidos,
            xpTotal: novoTotal
        });

        await recalcularXPTurma(dados.turmaId);
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// =================================================================
// FUNÇÕES DE RANKING
// =================================================================

async function obterRankingAlunosGeral() {
    try {
        const snapshot = await window.db.collection("alunos").orderBy("xpTotal", "desc").orderBy("nome").get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) { return []; }
}

async function obterRankingTurmasGeral() {
    try {
        const snapshot = await window.db.collection("turmas").orderBy("xpAtual", "desc").orderBy("nome").get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) { return []; }
}

// Alias para manter compatibilidade com ranking_turma.html
window.gerarRankingIndividualPorTurma = obterAlunosPorTurma;

// =================================================================
// GESTÃO (CADASTRO E EXCLUSÃO)
// =================================================================

async function cadastrarTurma(nome, meta) {
    await window.db.collection("turmas").add({ nome, metaMensal: parseInt(meta), xpAtual: 0 });
    return { success: true };
}

async function cadastrarAluno(nome, turmaId) {
    await window.db.collection("alunos").add({ nome, turmaId, xpTotal: 0, badges: [] });
    await recalcularXPTurma(turmaId);
    return { success: true };
}

async function excluirAluno(id, turmaId) {
    await window.db.collection("alunos").doc(id).delete();
    await recalcularXPTurma(turmaId);
    return { success: true };
}

async function excluirTurma(id) {
    await window.db.collection("turmas").doc(id).delete();
    return { success: true };
}

// Função para atualizar nome ou meta de uma turma
async function editarTurma(id, novoNome, novaMeta) {
    try {
        await window.db.collection("turmas").doc(id).update({
            nome: novoNome,
            metaMensal: parseInt(novaMeta)
        });
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// Função para atualizar nome de um aluno
async function editarAluno(id, novoNome) {
    try {
        await window.db.collection("alunos").doc(id).update({
            nome: novoNome
        });
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// Função para lançar pontos para múltiplos alunos de uma vez
async function atualizarPontuacaoColetiva(listaIds, xpMissao = 0, xpExtra = 0) {
    if (listaIds.length === 0) return { success: false, message: "Nenhum aluno selecionado" };

    const batch = window.db.batch(); // Usa "batch" para gravar todos de uma vez (mais rápido)

    try {
        for (let id of listaIds) {
            const ref = window.db.collection("alunos").doc(id);
            const doc = await ref.get();
            if (doc.exists) {
                const dados = doc.data();
                const novoTotal = (dados.xpTotal || 0) + xpMissao + xpExtra;
                
                batch.update(ref, {
                    xpMissoes: (dados.xpMissoes || 0) + xpMissao,
                    xpExtra: (dados.xpExtra || 0) + xpExtra,
                    xpTotal: novoTotal
                });
            }
        }

        await batch.commit();
        
        // Recalcula o total da turma após o lote (usando o ID da turma do primeiro aluno)
        const primeiroAluno = await window.db.collection("alunos").doc(listaIds[0]).get();
        await recalcularXPTurma(primeiroAluno.data().turmaId);

        return { success: true };
    } catch (error) {
        console.error("Erro no lançamento coletivo:", error);
        return { success: false, message: error.message };
    }
}

// Exportação global
window.obterTurmas = obterTurmas;
window.obterAlunosPorTurma = obterAlunosPorTurma;
window.obterMissoes = obterMissoes;
window.cadastrarTurma = cadastrarTurma;
window.cadastrarAluno = cadastrarAluno;
window.atualizarPontuacao = atualizarPontuacao;
window.excluirAluno = excluirAluno;
window.excluirTurma = excluirTurma;
window.obterRankingAlunosGeral = obterRankingAlunosGeral;
window.obterRankingTurmasGeral = obterRankingTurmasGeral;
window.editarTurma = editarTurma;
window.editarAluno = editarAluno;
window.atualizarPontuacaoColetiva = atualizarPontuacaoColetiva;