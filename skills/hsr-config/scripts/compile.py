"""Delegate validation and URL creation to the installed local HSR Analysis code."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', default=r'D:\HSR Analysis\伤害计算器')
    parser.add_argument('--catalog', action='store_true')
    parser.add_argument('--input')
    parser.add_argument('--output')
    parser.add_argument('--base')
    parser.add_argument('--url')
    args = parser.parse_args()
    project = Path(args.project).resolve()
    script = project / '_scripts' / 'compile_team_config.mjs'
    if not script.is_file() or not (project / 'package.json').is_file():
        parser.error('项目不存在或尚无配置导入模块：' + str(project))
    node = shutil.which('node')
    if not node:
        parser.error('未找到 Node.js，请使用已安装的项目运行环境')
    command = [node, str(script)]
    if args.catalog:
        command.append('--catalog')
    else:
        if not args.input or not args.output:
            parser.error('需要 --input 和 --output；只查询名称时用 --catalog')
        for key in ('input', 'output', 'base'):
            value = getattr(args, key)
            if value:
                command.extend(['--' + key, str(Path(value).resolve())])
        if args.url:
            command.extend(['--url', args.url])
    # No shell interpolation, downloads or application code evaluation.
    environment = dict(os.environ, PYTHONUTF8='1')
    return subprocess.run(command, cwd=project, env=environment, check=False).returncode


if __name__ == '__main__':
    sys.exit(main())
