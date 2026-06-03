# 🗺 Mapeador de Planta Baixa

App web para mapear pontos de **rede**, **telefone**, **câmera** e **switch** diretamente em plantas baixas em PDF.

---

##  Funcionalidades

-  Carrega plantas em PDF ou imagem
-  Marca pontos clicando diretamente na planta
-  Edita o nome de cada ponto
-  Adiciona anotações de texto livres
-  Salva e restaura sessão (pontos não se perdem)
-  Exporta a planta com os pontos em **PDF**
-  Exporta lista de pontos em **CSV**
-  Zoom com teclado ou botões

---

##  Como rodar com Docker

### Pré-requisitos
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e aberto

### Subir o app

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/planta-baixa-app.git
cd planta-baixa-app

# Suba o container
docker compose up -d
```

### Acessar

```
http://localhost:8080
```

### Parar

```bash
docker compose down
```

### Atualizar após editar arquivos

```bash
docker compose up -d --build
```

---

## 💻 Como rodar sem Docker

Abra a pasta no VS Code, instale a extensão **Live Server**, clique com botão direito no `index.html` e selecione **Open with Live Server**.

---

## 📁 Estrutura do projeto

```
planta-baixa-app/
├── index.html           # Estrutura da tela
├── style.css            # Visual e layout
├── app.js               # Lógica do app
├── Dockerfile           # Configuração do container
├── docker-compose.yml   # Orquestração do Docker
└── README.md
```

---

## ⌨️ Atalhos de teclado

| Tecla | Ação |
|-------|------|
| `R` | Ferramenta Rede |
| `T` | Ferramenta Telefone |
| `C` | Ferramenta Câmera |
| `S` | Ferramenta Switch |
| `X` | Ferramenta Texto |
| `Esc` | Cursor |
| `+` / `-` | Zoom |

---

## 🛠 Tecnologias

- [PDF.js](https://mozilla.github.io/pdf.js/) — renderização de PDF
- [jsPDF](https://github.com/parallax/jsPDF) — exportação em PDF
- [nginx](https://nginx.org/) — servidor web no Docker

---

> Desenvolvido para mapeamento de infraestrutura em plantas hospitalares e prediais.
