"""Ponte bidirecional Wokwi RFC2217 <-> Node TCP local.
Instale: python -m pip install pyserial
Execute: python wokwi/bridge.py (depois de iniciar o Wokwi e backend)
Não expõe conexões externas; apenas localhost.
"""
import argparse
import socket
import threading
import time


def executar(sim_url: str, host: str, porta: int):
    try:
        import serial
    except ImportError as exc:
        raise SystemExit('Instale pyserial: python -m pip install pyserial') from exc
    print(f'Abrindo serial virtual {sim_url}')
    with serial.serial_for_url(sim_url, baudrate=9600, timeout=0.2, write_timeout=2) as arduino:
        with socket.create_connection((host, porta), timeout=10) as backend:
            backend.settimeout(0.2)
            fim = threading.Event()
            print(f'Ponte conectada a {host}:{porta}. Pressione Ctrl+C para sair.')

            def sim_para_backend():
                try:
                    while not fim.is_set():
                        dados = arduino.read(1024)
                        if dados:
                            backend.sendall(dados)
                except (OSError, serial.SerialException) as err:
                    print('Serial virtual fechada:', err)
                finally:
                    fim.set()

            leitor = threading.Thread(target=sim_para_backend, daemon=True)
            leitor.start()
            try:
                while not fim.is_set():
                    try:
                        dados = backend.recv(1024)
                    except socket.timeout:
                        continue
                    if not dados:
                        break
                    arduino.write(dados)
            except (KeyboardInterrupt, OSError, serial.SerialException):
                pass
            finally:
                fim.set()
                leitor.join(timeout=1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Ponte serial virtual para o Alerta Visual')
    parser.add_argument('--wokwi', default='rfc2217://localhost:4000', help='Serial RFC2217 Wokwi')
    parser.add_argument('--host', default='127.0.0.1', help='Backend Node local')
    parser.add_argument('--port', default=4001, type=int, help='Porta SIM_TCP_PORT do backend')
    args = parser.parse_args()
    executar(args.wokwi, args.host, args.port)
