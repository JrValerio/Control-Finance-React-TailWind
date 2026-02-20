FROM grafana/alloy:latest

WORKDIR /etc/alloy

COPY alloy.config.alloy /etc/alloy/config.alloy

ENTRYPOINT ["/bin/alloy"]
CMD ["run", "/etc/alloy/config.alloy", "--server.http.listen-addr=0.0.0.0:12345"]
