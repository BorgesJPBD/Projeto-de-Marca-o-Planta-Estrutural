# Usa nginx Alpine (leve, ~23MB)
FROM nginx:alpine
 
# Copia os arquivos do projeto para o diretório padrão do nginx
COPY index.html  /usr/share/nginx/html/index.html
COPY style.css   /usr/share/nginx/html/style.css
COPY app.js      /usr/share/nginx/html/app.js
 
# Expõe a porta 80
EXPOSE 80
 
# Nginx já sobe automaticamente como comando padrão da imagem
 