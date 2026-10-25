FROM nginxinc/nginx-unprivileged:1.27-alpine
USER root
RUN mkdir -p /var/log/tasktracker && chown -R 101:101 /var/log/tasktracker
USER 101
COPY default.conf /etc/nginx/conf.d/default.conf
