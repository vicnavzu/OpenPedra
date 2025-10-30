import sys
from alembic.config import CommandLine

def main():
    cli = CommandLine()
    args = sys.argv[1:]
    cli.main(args)

if __name__ == "__main__":
    main()
